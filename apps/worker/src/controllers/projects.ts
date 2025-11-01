import { createDaytonaProvider } from "@/apis/sandbox";
import type { SandboxInstance } from "@/apis/sandbox";
import { config } from "@/lib/config";
import { Daytona } from "@daytonaio/sdk";
import path from "path";
import { createHash } from "crypto";
import stripJsonComments from "strip-json-comments";
import * as ProjectService from "@/services/projects";
import { buildDeploymentConfig, parseWranglerConfig, deployToDispatch } from "@/apis/deploy";

// ============================================================================
// Types
// ============================================================================

export interface InitializeProjectArgs {
  githubUrl: string;
  userId: string;
  name?: string;
}

export interface ResumeProjectArgs {
  projectId: string;
  sandboxId: string;
}

export interface RunAgentArgs {
  sandboxId: string;
  projectId: string;
  prompt: string;
  sessionId?: string;
  convexSessionId: string;
  model?: string;
  mode?: "build" | "plan";
}

export interface DeployProjectArgs {
  projectId: string;
  deployName?: string;
}

/**
 * Deploy a project to Cloudflare Workers
 */
export async function deployProject(
  args: DeployProjectArgs
): Promise<void> {
  const project = await ProjectService.getProjectById(args.projectId);

  if (!project) {
    throw new Error(`Project ${args.projectId} not found`);
  }

  const sandboxId = project.sandbox!.id;
  if (!sandboxId) {
    throw new Error("Project sandbox is not initialized");
  }

  const normalizedDeployName = args.deployName
    ? sanitizeScriptName(args.deployName)
    : undefined;

  const provider = createDaytonaProvider({
    apiKey: config.daytona.apiKey,
    serverUrl: config.daytona.serverUrl,
    snapshot: config.daytona.snapshot,
  });

  await ProjectService.updateDeploymentStatus(args.projectId, "starting", normalizedDeployName);

  const sandbox = await provider.resume(sandboxId);
  const workingDir = localWorkspacePath(args.projectId);

  await ProjectService.updateDeploymentStatus(args.projectId, "building");

  const buildResult = await sandbox.executeCommand(
    `cd ${workingDir} && bun run build`,
    { timeoutMs: 180_000 }
  );

  if (buildResult.exitCode !== 0) {
    const output =
      buildResult.stderr || buildResult.stdout || "Unknown build error";
    await ProjectService.updateDeploymentStatus(args.projectId, "build_failed");
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

  const wranglerConfig = wranglerDownloaded.buffer.toString("utf8");
  const workerContent = workerDownloaded.buffer.toString("utf8");

  let assetsManifest:
    | Record<string, { hash: string; size: number }>
    | undefined;
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
  let assetsConfig: any | undefined;
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

  await ProjectService.updateDeploymentStatus(args.projectId, "uploading");

  // Prepare deploy configuration and assets
  const wrangler = parseWranglerConfig(wranglerConfigOut);
  const fileContents = files && files.length
    ? new Map(files.map((f) => [f.path, Buffer.from(f.base64, "base64")]))
    : undefined;

  const deployConfig = buildDeploymentConfig(
    wrangler,
    workerContent,
    config.cloudflare.accountId!,
    config.cloudflare.apiToken!,
    assetsManifest,
    compatibilityFlags,
  );

  // Execute deployment directly (no HTTP hop)
  await deployToDispatch(
    { ...deployConfig, dispatchNamespace: config.cloudflare.dispatchNamespace! },
    fileContents,
    undefined,
    wrangler.assets,
  );

  // Update sandbox deployment status
  await ProjectService.updateProjectSandbox(args.projectId, {
    ...(project.sandbox as any),
    deployed: true,
    deployName: normalizedDeployName,
  } as any);

  await ProjectService.updateDeploymentStatus(args.projectId, "deployed");
}

const posix = path.posix;

function localWorkspacePath(projectId: string): string {
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return posix.join("/tmp", safeProjectId || "project");
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\"'\"'");
}

function shellQuote(value: string): string {
  return `'${escapeSingleQuotes(value)}'`;
}

function buildBashCommand(workingDirectory: string, script: string): string {
  const lines = ["set -euo pipefail", `cd ${shellQuote(workingDirectory)}`, script].filter(
    Boolean
  );
  const fullScript = lines.join("\n");
  return `bash -lc '${escapeSingleQuotes(fullScript)}'`;
}

function getDaytonaClient(): Daytona {
  return new Daytona({
    apiKey: config.daytona.apiKey,
    apiUrl: config.daytona.serverUrl,
  });
}

async function directoryExists(
  sandbox: SandboxInstance,
  directory: string
): Promise<boolean> {
  try {
    const info = await sandbox.fs.getFileDetails(directory);
    return isDirectory(info);
  } catch {
    return false;
  }
}

async function collectAssets(
  sandbox: SandboxInstance,
  rootDir: string
): Promise<{
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
      const normalizedRelative = relative
        ? `/${relative.split(posix.sep).join("/")}`
        : "/";
      manifest[normalizedRelative] = {
        hash: createHash("sha256").update(buffer).digest("hex").slice(0, 32),
        size: buffer.length,
      };
      files.push({
        path: normalizedRelative,
        base64: buffer.toString("base64"),
      });
    }
  }
}

function resolveEntryPath(currentDir: string, entry: unknown): string {
  const info = entry as Record<string, any>;
  if (typeof info.path === "string" && info.path.length > 0) {
    return info.path;
  }
  const name = typeof info.name === "string" ? info.name : "";
  return name ? posix.join(stripTrailingSlash(currentDir), name) : currentDir;
}

function isDirectory(entry: unknown): boolean {
  const info = entry as Record<string, any>;
  if (typeof info?.isDir === "boolean") return info.isDir;
  if (typeof info?.is_dir === "boolean") return info.is_dir;
  if (typeof info?.type === "string") return info.type === "directory";
  return false;
}

function stripTrailingSlash(input: string): string {
  if (input.length > 1 && input.endsWith("/")) {
    return input.slice(0, -1);
  }
  return input;
}

async function downloadFirstExistingFile(
  sandbox: SandboxInstance,
  candidatePaths: string[]
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
  throw new Error(`Required file not found. Tried: ${candidatePaths.join(", ")}`);
}

function sanitizeScriptName(input: string): string {
  const lower = input.toLowerCase();
  const replaced = lower.replace(/[^a-z0-9-]+/g, "-");
  const collapsed = replaced.replace(/-+/g, "-");
  const trimmed = collapsed.replace(/^-+|-+$/g, "");
  return trimmed.slice(0, 63);
}

/**
 * Configure an existing sandbox to run indefinitely (disable auto-stop)
 */
export async function setRunIndefinitely(sandboxId: string): Promise<{ sandboxId: string }> {
  const daytona = getDaytonaClient();
  const sandbox = await daytona.get(sandboxId);
  await sandbox.setAutostopInterval(0);
  return { sandboxId };
}

// ============================================================================
// Sandbox Initialization & Resume
// ============================================================================

async function getOrCreateSandbox(options: {
  port: number;
  workingDirectory: string;
  sandboxId?: string;
}): Promise<{ sandboxId: string; previewUrl: string }> {
  const provider = createDaytonaProvider({
    apiKey: config.daytona.apiKey,
    serverUrl: config.daytona.serverUrl,
    snapshot: config.daytona.snapshot,
  });

  let sandbox: SandboxInstance;

  if (options.sandboxId) {
    try {
      sandbox = await provider.resume(options.sandboxId);
    } catch (error) {
      console.log("Failed to resume sandbox, creating new one", error);
      sandbox = await provider.create({}, options.workingDirectory);
    }
  } else {
    sandbox = await provider.create({}, options.workingDirectory);
  }

  const previewUrl = await sandbox.getHost(options.port);

  return {
    sandboxId: sandbox.sandboxId,
    previewUrl,
  };
}

/**
 * Initialize a project sandbox and persist fields on the project
 */
export async function initializeProject(
  args: InitializeProjectArgs
): Promise<{ projectId: string; sandboxId: string; previewUrl: string }> {
  const now = new Date();
  const created = await ProjectService.createProject({
    userId: args.userId,
    name: args.name || "app",
    githubUrl: args.githubUrl,
  });

  const projectId = created.id;
  const workingDirectory = localWorkspacePath(projectId);

  const base = await getOrCreateSandbox({
    port: 3000,
    workingDirectory,
  });

  const provider = createDaytonaProvider({
    apiKey: config.daytona.apiKey,
    serverUrl: config.daytona.serverUrl,
  });

  const sandbox = await provider.get(base.sandboxId);

  if (args.githubUrl) {
    await sandbox.git.clone(args.githubUrl, workingDirectory);
  }

  // Read surgent.json for init and dev scripts
  let initScript: string | undefined;
  let devScript: string | undefined;
  try {
    const buffer = await sandbox.exec(`cat ${workingDirectory}/surgent.json`, { timeoutSeconds: 10 });
    const config = JSON.parse(stripJsonComments(buffer.result));

    console.log("config", config);
    initScript = config?.scripts?.init;
    devScript = config?.scripts?.dev;
  } catch {
    // no surgent.json
  }

  console.log("initScript", initScript);
  console.log("devScript", devScript);

  // Run init script
  if (initScript) {
    const initResult = await sandbox.exec (
      buildBashCommand(workingDirectory, initScript),
      { timeoutSeconds: 30 * 60 }
    );
    console.log("initResult", initResult.exitCode);
  }

  // Start dev server with PM2
  let processName =`${projectId}-vite-server`;

  if (devScript) {
    const pm2Cmd = `pm2 start "${devScript}" --name ${processName}`;
    const devResult = await sandbox.exec(
      pm2Cmd,
      { timeoutSeconds: 5 * 60, cwd: workingDirectory }
    );
    console.log("devResult", devResult.exitCode, devResult.result);
    const agentResult = await sandbox.exec(`pm2 start "opencode serve --hostname 0.0.0.0 --port 4096" --name agent-opencode-server`, {
      timeoutSeconds: 5 * 60,
      cwd: workingDirectory,
    });
    console.log("agentResult", agentResult.exitCode);
  }

  // Persist metadata
  await ProjectService.updateProjectMetadata(projectId, {
    workingDirectory,
    processName,
    startCommand: devScript,
  } as any);

  // Update sandbox state
  await ProjectService.updateProjectSandbox(projectId, {
    id: base.sandboxId,
    previewUrl: base.previewUrl,
    status: "started",
    isInitialized: true,
  } as any);

  return { projectId, sandboxId: base.sandboxId, previewUrl: base.previewUrl };
}

/**
 * Resume a project sandbox and restart processes
 */
export async function resumeProject(
  args: ResumeProjectArgs
): Promise<{ sandboxId: string; previewUrl: string }> {
  const workingDirectory = localWorkspacePath(args.projectId);

  const base = await getOrCreateSandbox({
    sandboxId: args.sandboxId,
    port: 3000,
    workingDirectory,
  });

  // Start/restart app and agent processes with pm2
  try {
    const provider = createDaytonaProvider({
      apiKey: config.daytona.apiKey,
      serverUrl: config.daytona.serverUrl,
    });
    const sandbox = await provider.get(base.sandboxId);

    // Load project metadata
    const project = await ProjectService.getProjectById(args.projectId);

    const startCommand = (project?.metadata as any)?.startCommand;
    const processName = (project?.metadata as any)?.processName;

    if (startCommand && processName) {
      // Check if process already exists
      const checkProcess = await sandbox.exec(`pm2 describe ${processName} 2>/dev/null`, {
        timeoutSeconds: 30,
        cwd: workingDirectory,
      });

      if (checkProcess.exitCode !== 0) {
        // Process doesn't exist, start it
        console.log(`Starting process: ${processName}`);
        const pm2Script = `pm2 start "${startCommand}" --name ${processName}`;
        const result = await sandbox.exec(pm2Script, {
          timeoutSeconds: 5 * 60,
          cwd: workingDirectory,
        });
        console.log("App process started", result.exitCode);
      } else {
        console.log(`Process ${processName} already running, skipping start`);
      }
    }

    // Check if agent server is already running
    const checkAgent = await sandbox.exec(`pm2 describe agent-opencode-server 2>/dev/null`, {
      timeoutSeconds: 30,
      cwd: workingDirectory,
    });
    console.log("checkAgent", checkAgent.exitCode);
    if (checkAgent.exitCode !== 0) {
      // Agent process doesn't exist, start it
      console.log("Starting agent server");
      const agentStart = `pm2 start "opencode serve --hostname 0.0.0.0 --port 4096" --name agent-opencode-server`;
      const agentResult = await sandbox.exec(agentStart, {
        timeoutSeconds: 5 * 60,
        cwd: workingDirectory,
      });
      console.log("Agent server started", agentResult.exitCode);
    } else {
      console.log("Agent server already running, skipping start");
    }
  } catch (err) {
    console.log("resumeProject pm2 start error", err);
  }

  return { sandboxId: base.sandboxId, previewUrl: base.previewUrl };
}
