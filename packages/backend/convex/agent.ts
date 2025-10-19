"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { ClaudeAgent } from "./agentic/agent/claude";
import { BaseAgent } from "./agentic/agent/base";
import { createDaytonaProvider } from "./agentic/sandbox/daytona";
import type { SandboxInstance } from "./agentic/sandbox/daytona";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { getOrCreateSandbox } from "./sandbox";
import { config } from "./config";
import { Daytona } from "@daytonaio/sdk";
import path from "path";
import { createHash } from "crypto";
import stripJsonComments from "strip-json-comments";

// Initialize a project sandbox and persist fields on the project
export const initializeProject = internalAction({
  args: {
    projectId: v.id("projects"),
    template: v.object({
      _id: v.optional(v.id("templates")),
      slug: v.optional(v.string()),
      name: v.string(),
      description: v.optional(v.string()),
      repoUrl: v.string(),
      branch: v.optional(v.string()),
      initScript: v.optional(v.string()),
      startCommand: v.optional(v.string()),
      metadata: v.optional(v.any()),
    }),
  },
  returns: v.object({ sandboxId: v.string(), previewUrl: v.string(), sessionId: v.optional(v.string()), cmdId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    // Load project via internal query to bypass user auth in internal action
    const project: any = await ctx.runQuery(internal.projects.getProjectInternal, {
      projectId: args.projectId,
    });

    const workingDirectory = localWorkspacePath(args.projectId);

    const base = await getOrCreateSandbox({
      sandboxId: project?.sandboxId,
      port: 3000,
      workingDirectory,
    });

    // Resolve template values from provided template object only
    const repoUrl = args.template.repoUrl;
    const branch = args.template.branch;
    const initScript = args.template.initScript;
    const startCommand = args.template.startCommand;

    const provider = createDaytonaProvider({
      apiKey: config.daytona.apiKey,
      serverUrl: config.daytona.serverUrl,
    });

    let sandboxInstance: SandboxInstance | undefined;

    // Clone repo into the sandbox working directory if not already initialized, then run init script
    try {
      sandboxInstance = await provider.get(base.sandboxId);

      if (repoUrl) await sandboxInstance.git.clone(repoUrl, workingDirectory, branch || undefined);

      const init = (initScript || "").trim();
      if (init) {
        const command = buildBashCommand(workingDirectory, init);
        const result = await sandboxInstance.commands.run(command, { timeoutMs: 30 * 60 * 1000 });
        console.log("init result", result);
      }
    } catch {
      // Non-fatal: repo clone/init is optional for initialization
    }
    // Optionally start the dev server using PM2 directly (no session)
    let pm2ProcessName: string | undefined;
    const start = startCommand?.trim();
    if (start) {
      pm2ProcessName = sanitizeScriptName(args.template.name || 'app');
      const pm2Script = `pm2 start bash --name ${shellQuote(pm2ProcessName)} --cwd ${shellQuote(workingDirectory)} -- -lc ${shellQuote(start)}`;

      const inst = await provider.get(base.sandboxId)
      const command = buildBashCommand(workingDirectory, pm2Script);
      const result = await inst.commands.run(command, { timeoutMs: 5 * 60 * 1000 });
      console.log('pm2 start result', result);
    }

    // Persist provided repo/init/start in project metadata for later use (e.g., start button)
    try {
      await ctx.runMutation(internal.projects.setProjectMetadata, {
        projectId: args.projectId,
        metadata: {
          workingDirectory,
          templateId: args.template._id,
          processName: pm2ProcessName,
        },
      });
    } catch {
      // Non-fatal: metadata persistence failure should not block initialization
    }

    await ctx.runMutation(internal.projects.setSandboxState, {
      projectId: args.projectId,
      sandboxId: base.sandboxId,
      previewUrl: base.previewUrl,
      isInitialized: true,
    });

    return { sandboxId: base.sandboxId, previewUrl: base.previewUrl };
  },
});

// Initialize a project sandbox and persist fields on the project
export const resumeProject = internalAction({
  args: { projectId: v.id("projects"), sandboxId: v.string() },
  returns: v.object({ sandboxId: v.string(), previewUrl: v.string() }),
  handler: async (ctx, args) => {
    const workingDirectory = localWorkspacePath(args.projectId);

    const base = await getOrCreateSandbox({
      sandboxId: args.sandboxId,
      port: 3000,
      workingDirectory,
    });

    return { sandboxId: base.sandboxId, previewUrl: base.previewUrl };
  },
});

// Start the project's dev server using Daytona sessions and return session/cmd IDs
// (removed) startProject logic is folded into initializeProject

export const runAgent = internalAction({
  args: {
    sandboxId: v.string(),
    projectId: v.id("projects"),
    prompt: v.string(),
    sessionId: v.optional(v.string()),
    convexSessionId: v.optional(v.id("sessions")),
    model: v.optional(v.string()),
    template: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("ask"), v.literal("code"))),
  },
  returns: v.object({
    exitCode: v.number(),
    stdout: v.string(),
    stderr: v.string(),
    sandboxId: v.string(),
    sessionId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const workingDirectory = localWorkspacePath(args.projectId);

    const provider = createDaytonaProvider({
      apiKey: config.daytona.apiKey,
      snapshot: args.template || "default-env:1.0.0",
    });

    const agent: BaseAgent = new ClaudeAgent({
      provider: "anthropic",
      providerApiKey: config.anthropic.apiKey,
      providerBaseUrl: config.anthropic.baseUrl,
      model: args.model || "glm-4.6",
      sandboxProvider: provider,
      sandboxId: args.sandboxId,
      workingDirectory,
    });

    if (args.sessionId) {
      try {
        await agent.setSession(args.sessionId);
      } catch {
        // Non-fatal: continue without binding to a previous session
      }
    }

    let finalSessionMessageId: Id<"sessionMessages"> | undefined;

    const handleUpdate = async (message: string) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === "start" && parsed.sandbox_id) return;
        const insertedId = await ctx.runMutation(internal.sessions.appendMessage, {
          sessionId: args.convexSessionId!,
          raw: parsed,
        });
        if (parsed?.type === "result") {
          finalSessionMessageId = insertedId as Id<"sessionMessages">;
        }
      } catch {
        // Ignore invalid or non-JSON progress messages
      }
    };

    const result = await agent.generateCode(
      args.prompt,
      args.mode || "code",
      undefined,
      { onUpdate: handleUpdate },
      true
    );

    const checkpoint = await agent.createLocalCheckpoint(
      `Checkpoint after run: ${args.mode || "code"}`
    );
    if (checkpoint) {
      // Persist metadata in Convex commits table (requires session id)
      if (args.convexSessionId) {
        await ctx.runMutation(api.commits.saveCheckpoint, {
          projectId: args.projectId,
          sessionId: args.convexSessionId,
          sha: checkpoint.sha,
          message: checkpoint.message,
          stats: checkpoint.stats,
          messageId: finalSessionMessageId,
        });
      }
    }

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      sandboxId: result.sandboxId,
    } as const;
  },
});

export const deployProject = internalAction({
  args: { projectId: v.id("projects"), deployName: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { projectId, deployName }) => {
    const project = await ctx.runQuery(internal.projects.getProjectInternal, { projectId: projectId });
    
    if (!project?.sandboxId) {
      throw new Error('Project sandbox is not initialized');
    }

    if (!config.cloudflare.deployUrl) {
      throw new Error('CLOUDFLARE_DEPLOY_URL is not configured');
    }

    const normalizedDeployName = deployName ? sanitizeScriptName(deployName) : undefined;

    const provider = createDaytonaProvider({
      apiKey: config.daytona.apiKey,
      serverUrl: config.daytona.serverUrl,
      snapshot: 'default-web-env:1.0.0',
    });

    await ctx.runMutation(internal.projects.setDeployment, {
      projectId: projectId as Id<'projects'>,
      status: 'starting',
      name: normalizedDeployName,
    });

    const sandbox = await provider.resume(project.sandboxId);
    const workingDir = localWorkspacePath(projectId);
    await ctx.runMutation(internal.projects.setDeployment, {
      projectId: projectId as Id<'projects'>,
      status: 'building',
    });
    const buildResult = await sandbox.commands.run(
      `cd ${workingDir} && bun run build`,
      { timeoutMs: 180_000 },
    );  
    if (buildResult.exitCode !== 0) {
      const output = buildResult.stderr || buildResult.stdout || 'Unknown build error';
      await ctx.runMutation(internal.projects.setDeployment, {
        projectId: projectId as Id<'projects'>,
        status: 'build_failed',
      });
      throw new Error(`Sandbox build failed: ${output}`);
    }

    const wranglerDownloaded = await downloadFirstExistingFile(sandbox, [
      `${workingDir}/dist/vite_reference/wrangler.json`,
      `${workingDir}/wrangler.jsonc`,
      `${workingDir}/wrangler.json`,
    ]);
    const workerDownloaded = await downloadFirstExistingFile(sandbox, [
      `${workingDir}/dist/vite_reference/index.js`,
      `${workingDir}/dist/index.js`,
    ]);
    // workerPath is validated by successful download above

    const wranglerConfig = wranglerDownloaded.buffer.toString('utf8');
    const workerContent = workerDownloaded.buffer.toString('utf8');

    let assetsManifest: Record<string, { hash: string; size: number }> | undefined;
    let files: Array<{ path: string; base64: string }> | undefined;

    const assetsRoot = `${workingDir}/dist/client`;
    if (await directoryExists(sandbox, assetsRoot)) {
      const collected = await collectAssets(sandbox, assetsRoot);
      if (Object.keys(collected.manifest).length > 0) {
        assetsManifest = collected.manifest;
      }
      if (collected.files.length > 0) {
        files = collected.files;
      }
    }

    let compatibilityFlags: string[] | undefined;
    let assetsConfig: unknown;
    let wranglerConfigOut = wranglerConfig;
    try {
      const parsed = JSON.parse(stripJsonComments(wranglerConfig));
      if (normalizedDeployName) {
        parsed.name = normalizedDeployName;
      }
      wranglerConfigOut = JSON.stringify(parsed);
      if (Array.isArray(parsed?.compatibility_flags)) {
        compatibilityFlags = parsed.compatibility_flags;
      }
      if (parsed?.assets) {
        assetsConfig = parsed.assets;
      }
    } catch {
      // ignore parse errors of wrangler config
    }

    const payload = {
      wranglerConfig: wranglerConfigOut,
      workerContent,
      assetsManifest,
      files,
      compatibilityFlags,
      assetsConfig,
    };

    await ctx.runMutation(internal.projects.setDeployment, {
      projectId: projectId as Id<'projects'>,
      status: 'uploading',
    });

    const response = await fetch(config.cloudflare.deployUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      await ctx.runMutation(internal.projects.setDeployment, {
        projectId: projectId as Id<'projects'>,
        status: 'deploy_failed',
      });
      throw new Error(`Cloudflare deployment failed: ${response.status} ${text}`);
    }

    await ctx.runMutation(internal.projects.setSandboxDeployed, {
      projectId: projectId as Id<'projects'>,
      deployed: true,
      deployName: normalizedDeployName,
    });
    await ctx.runMutation(internal.projects.setDeployment, {
      projectId: projectId as Id<'projects'>,
      status: 'deployed',
    });
    return null;
  },
});

const posix = path.posix;

function localWorkspacePath(projectId: Id<'projects'>): string {
  const safeProjectId = String(projectId).replace(/[^a-zA-Z0-9_-]+/g, '-');
  return posix.join('/tmp', safeProjectId || 'project');
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\"'\"'");
}

function shellQuote(value: string): string {
  return `'${escapeSingleQuotes(value)}'`;
}

function buildBashCommand(workingDirectory: string, script: string): string {
  const lines = [
    'set -euo pipefail',
    `cd ${shellQuote(workingDirectory)}`,
    script,
  ].filter(Boolean);
  const fullScript = lines.join('\n');
  return `bash -lc '${escapeSingleQuotes(fullScript)}'`;
}

function getDaytonaClient(): Daytona {
  return new Daytona({
    apiKey: config.daytona.apiKey,
    apiUrl: config.daytona.serverUrl || "https://app.daytona.io/api",
  });
}

async function directoryExists(sandbox: SandboxInstance, directory: string): Promise<boolean> {
  try {
    const info = await sandbox.fs.getFileDetails(directory);
    return isDirectory(info);
  } catch {
    return false;
  }
}

async function collectAssets(sandbox: SandboxInstance, rootDir: string): Promise<{
  manifest: Record<string, { hash: string; size: number }>;
  files: Array<{ path: string; base64: string }>;
}> {
  const normalizedRoot = stripTrailingSlash(rootDir);
  const manifest: Record<string, { hash: string; size: number }> = {};
  const files: Array<{ path: string; base64: string }> = [];

  await walkDir(rootDir);
  return { manifest, files };

  async function walkDir(currentDir: string): Promise<void> {
    const entries = await sandbox.fs.listFiles(currentDir);
    for (const entry of entries) {
      const entryPath = resolveEntryPath(currentDir, entry);
      if (isDirectory(entry)) {
        await walkDir(entryPath);
        continue;
      }

      const buffer = await sandbox.fs.downloadFile(entryPath);
      const relative = posix.relative(normalizedRoot, entryPath);
      const normalizedRelative = relative ? `/${relative.split(posix.sep).join('/')}` : '/';
      manifest[normalizedRelative] = {
        hash: createHash('sha256').update(buffer).digest('hex').slice(0, 32),
        size: buffer.length,
      };
      files.push({ path: normalizedRelative, base64: buffer.toString('base64') });
    }
  }
}

function resolveEntryPath(currentDir: string, entry: unknown): string {
  const info = entry as Record<string, any>;
  if (typeof info.path === 'string' && info.path.length > 0) {
    return info.path as string;
  }
  const name = typeof info.name === 'string' ? info.name : '';
  return name ? posix.join(stripTrailingSlash(currentDir), name) : currentDir;
}

function isDirectory(entry: unknown): boolean {
  const info = entry as Record<string, any>;
  if (typeof info?.isDir === 'boolean') return info.isDir;
  if (typeof info?.is_dir === 'boolean') return info.is_dir;
  if (typeof info?.type === 'string') return info.type === 'directory';
  return false;
}

function stripTrailingSlash(input: string): string {
  if (input.length > 1 && input.endsWith('/')) {
    return input.slice(0, -1);
  }
  return input;
}

// Try a list of candidate paths and return the first that exists with its contents
async function downloadFirstExistingFile(
  sandbox: SandboxInstance,
  candidatePaths: string[],
): Promise<{ path: string; buffer: Buffer }> {
  for (const p of candidatePaths) {
    try {
      const info = await sandbox.fs.getFileDetails(p);
      if (!isDirectory(info)) {
        const buffer = await sandbox.fs.downloadFile(p);
        return { path: p, buffer } as { path: string; buffer: Buffer };
      }
    } catch {
      // ignore and try next path
    }
  }
  throw new Error(
    `Required file not found. Tried: ${candidatePaths.join(', ')}`,
  );
}

function sanitizeScriptName(input: string): string {
  const lower = input.toLowerCase();
  const replaced = lower.replace(/[^a-z0-9-]+/g, '-');
  const collapsed = replaced.replace(/-+/g, '-');
  const trimmed = collapsed.replace(/^-+|-+$/g, '');
  return trimmed.slice(0, 63);
}

// Configure an existing sandbox to run indefinitely (disable auto-stop)
export const setRunIndefinitely = internalAction({
  args: { sandboxId: v.string() },
  returns: v.object({ sandboxId: v.string() }),
  handler: async (_ctx, args) => {
    const daytona = getDaytonaClient();

    const sandbox = await daytona.get(args.sandboxId);

    // Disable auto-stop; optionally harden archive/delete settings
    await sandbox.setAutostopInterval(0);

    return { sandboxId: args.sandboxId } as const;
  },
});
