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
  args: { projectId: v.id("projects") },
  returns: v.object({ sandboxId: v.string(), previewUrl: v.string() }),
  handler: async (ctx, args) => {
    // Load project via public query
    const project: any = await ctx.runQuery(api.projects.getProject, {
      projectId: args.projectId,
    });

    const base = await getOrCreateSandbox({
      sandboxId: project?.sandboxId,
      port: 3000,
      templatePath: "/workspace/template",
      workingDirectory: "/tmp/project",
    });

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
    const base = await getOrCreateSandbox({
      sandboxId: args.sandboxId,
      port: 3000,
      templatePath: "/workspace/template",
      workingDirectory: "/tmp/project",
    });

    return { sandboxId: base.sandboxId, previewUrl: base.previewUrl };
  },
});

export const runAgent = internalAction({
  args: {
    sandboxId: v.string(),
    projectId: v.id("projects"),
    prompt: v.string(),
    sessionId: v.optional(v.string()),
    convexSessionId: v.optional(v.id("sessions")),
    model: v.optional(v.string()),
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
    const provider = createDaytonaProvider({
      apiKey: config.daytona.apiKey,
      snapshot: "default-web-env:1.0.0",
    });

    console.log("agent is starting", args.sandboxId);

    const agent: BaseAgent = new ClaudeAgent({
      provider: "anthropic",
      providerApiKey: config.anthropic.apiKey,
      providerBaseUrl: config.anthropic.baseUrl,
      model: args.model || "glm-4.5",
      sandboxProvider: provider,
      sandboxId: args.sandboxId,
      workingDirectory: "/tmp/project",
    });

    console.log("agent is created now",config.anthropic.baseUrl,config.anthropic.apiKey);
    

    if (args.sessionId) {
      try {
        await agent.setSession(args.sessionId);
      } catch {}
    }
    console.log("agent is running");

    let finalSessionMessageId: Id<"sessionMessages"> | undefined;

    const handleUpdate = async (message: string) => {
      try {
        const parsed = JSON.parse(message);
        console.log("parsed", parsed);
        if (parsed.type === "start" && parsed.sandbox_id) return;
        const insertedId = await ctx.runMutation(internal.sessions.appendMessage, {
          sessionId: args.convexSessionId!,
          raw: parsed,
        });
        if (parsed?.type === "result") {
          finalSessionMessageId = insertedId as Id<"sessionMessages">;
        }
      } catch {}
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
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, { projectId }) => {
    const project = await ctx.runQuery(api.projects.getProject, {
      projectId: projectId as Id<'projects'>,
    });
    if (!project) {
      throw new Error('Project not found');
    }
    if (!project.sandboxId) {
      throw new Error('Project sandbox is not initialized');
    }

    if (!config.cloudflare.deployUrl) {
      throw new Error('CLOUDFLARE_DEPLOY_URL is not configured');
    }

    const provider = createDaytonaProvider({
      apiKey: config.daytona.apiKey,
      serverUrl: config.daytona.serverUrl,
      snapshot: 'default-web-env:1.0.0',
    });

    const sandbox = await provider.resume(project.sandboxId);
    const workingDir = '/tmp/project';

    const buildResult = await sandbox.commands.run(
      `cd ${workingDir} && bun run build`,
      { timeoutMs: 180_000 },
    );
    if (buildResult.exitCode !== 0) {
      const output = buildResult.stderr || buildResult.stdout || 'Unknown build error';
      throw new Error(`Sandbox build failed: ${output}`);
    }

    const wranglerBuffer = await sandbox.fs.downloadFile(`${workingDir}/wrangler.jsonc`);
    const workerBuffer = await sandbox.fs.downloadFile(`${workingDir}/dist/index.js`);

    const wranglerConfig = wranglerBuffer.toString('utf8');
    const workerContent = workerBuffer.toString('utf8');

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
    try {
      const parsed = JSON.parse(stripJsonComments(wranglerConfig));
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
      wranglerConfig,
      workerContent,
      assetsManifest,
      files,
      compatibilityFlags,
      assetsConfig,
    };

    const response = await fetch(config.cloudflare.deployUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cloudflare deployment failed: ${response.status} ${text}`);
    }

    await ctx.runMutation(internal.projects.setSandboxDeployed, {
      projectId: projectId as Id<'projects'>,
      deployed: true,
    });

    return null;
  },
});

const posix = path.posix;

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

// Configure an existing sandbox to run indefinitely (disable auto-stop)
export const setRunIndefinitely = internalAction({
  args: { sandboxId: v.string() },
  returns: v.object({ sandboxId: v.string() }),
  handler: async (_ctx, args) => {
    const daytona = new Daytona({
      apiKey: config.daytona.apiKey,
      apiUrl: config.daytona.serverUrl || "https://app.daytona.io/api",
    });

    const sandbox = await daytona.get(args.sandboxId);

    // Disable auto-stop; optionally harden archive/delete settings
    await sandbox.setAutostopInterval(0);

    return { sandboxId: args.sandboxId } as const;
  },
});
