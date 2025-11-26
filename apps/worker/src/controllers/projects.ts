import { createDaytonaProvider } from "@/apis/sandbox";
import type { SandboxInstance } from "@/apis/sandbox";
import { config } from "@/lib/config";
import { Daytona } from "@daytonaio/sdk";
import path from "path";
import { createHash } from "crypto";
import stripJsonComments from "strip-json-comments";
import * as ProjectService from "@/services/projects";
import { buildDeploymentConfig, parseWranglerConfig, deployToDispatch } from "@/apis/deploy";
import { createProjectOnTeam, createDeployKey, setDeploymentEnvVars } from "@/apis/convex";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { parse as parseDotEnv } from "dotenv";

// ============================================================================
// Types
// ============================================================================

export interface InitializeProjectArgs {
  githubUrl: string;
  userId: string;
  name?: string;
  initConvex?: boolean;
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
  let step = "start";
  try {
    console.log("[deploy] start", { projectId: args.projectId, deployName: args.deployName });

    const project = await ProjectService.getProjectById(args.projectId);
    if (!project) throw new Error(`Project ${args.projectId} not found`);

    const sandboxId = project.sandbox!.id;
    if (!sandboxId) throw new Error("Project sandbox is not initialized");

    const hasConvex = !!(project.metadata as any)?.convex;
    const normalizedDeployName = args.deployName ? sanitizeScriptName(args.deployName) : undefined;

    step = "status:starting";
    await ProjectService.updateDeploymentStatus(args.projectId, "starting", normalizedDeployName);

    step = "resume";
    const provider = createDaytonaProvider({ apiKey: config.daytona.apiKey, serverUrl: config.daytona.serverUrl, snapshot: config.daytona.snapshot });
    const sandbox = await provider.resume(sandboxId);
    const workingDir = localWorkspacePath(args.projectId);

    step = "status:building";
    await ProjectService.updateDeploymentStatus(args.projectId, "building");

    step = "build";
    const buildResult = await sandbox.exec(`bun run build`, { cwd: workingDir, timeoutSeconds: 180_000 });
    if (buildResult.exitCode !== 0) {
      await ProjectService.updateDeploymentStatus(args.projectId, "build_failed");
      throw new Error(`Build failed: ${String(buildResult.result).slice(0, 500)}`);
    }

    step = "read:inputs";
    const wranglerCat = await readFirstExistingFile(sandbox, [
      `${workingDir}/dist/vite_reference/wrangler.json`,
      `${workingDir}/wrangler.jsonc`,
      `${workingDir}/wrangler.json`,
    ], workingDir);
    const workerCat = await readFirstExistingFile(sandbox, [
      `${workingDir}/dist/vite_reference/index.js`,
      `${workingDir}/dist/index.js`,
    ], workingDir);

    const wranglerConfig = wranglerCat.content;
    const workerContent = workerCat.content;

    step = "assets";
    let assetsManifest: Record<string, { hash: string; size: number }> | undefined;
    let files: Array<{ path: string; base64: string }> | undefined;
    const assetsRoot = `${workingDir}/dist/client`;
    if (await directoryExists(sandbox, assetsRoot)) {
      const collected = await collectAssets(sandbox, assetsRoot);
      if (Object.keys(collected.manifest).length) assetsManifest = collected.manifest;
      if (collected.files.length) files = collected.files;
    }

    // Read .env.local for env vars to inject into worker vars
    step = "env:read";
    let envFromDotenvLocal: Record<string, string> | undefined;
    try {
      const envBuf = await downloadFileSafe(sandbox, `${workingDir}/.env.local`, workingDir);
      envFromDotenvLocal = parseDotEnv(envBuf);
    } catch {
      // .env.local not found, continue silently
    }

    step = "wrangler:parse";
    let compatibilityFlags: string[] | undefined;
    let wranglerConfigOut = wranglerConfig;
    try {
      const parsed = JSON.parse(stripJsonComments(wranglerConfig));
      if (normalizedDeployName) parsed.name = normalizedDeployName;
      wranglerConfigOut = JSON.stringify(parsed);
      if (Array.isArray(parsed?.compatibility_flags)) compatibilityFlags = parsed.compatibility_flags;
    } catch {}

    step = "status:uploading";
    await ProjectService.updateDeploymentStatus(args.projectId, "uploading");

    step = "deploy";
    const wrangler = parseWranglerConfig(wranglerConfigOut);
    const fileContents = files && files.length ? new Map(files.map((f) => [f.path, Buffer.from(f.base64, "base64")])) : undefined;
    const deployConfig = buildDeploymentConfig(
      wrangler,
      workerContent,
      config.cloudflare.accountId!,
      config.cloudflare.apiToken!,
      assetsManifest,
      compatibilityFlags,
    );
    // Merge .env.local vars (if any) with wrangler vars; wrangler vars take precedence
    if (envFromDotenvLocal && Object.keys(envFromDotenvLocal).length > 0) {
      deployConfig.vars = {
        ...(envFromDotenvLocal || {}),
        ...(deployConfig.vars || {}),
      };
    }
    await deployToDispatch({ ...deployConfig, dispatchNamespace: config.cloudflare.dispatchNamespace! }, fileContents, undefined, wrangler.assets);

    step = "status:deployed";
    await ProjectService.updateProjectSandbox(args.projectId, { ...(project.sandbox as any), deployed: true, deployName: normalizedDeployName } as any);
    await ProjectService.updateDeploymentStatus(args.projectId, "deployed");

    console.log("[deploy] success", { projectId: args.projectId });
  } catch (err: any) {
    console.error("[deploy] failed", { projectId: args.projectId, step, error: err?.message ?? String(err) });
    throw err;
  }
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

async function downloadFileSafe(
  sandbox: SandboxInstance,
  path: string,
  cwd?: string,
): Promise<Buffer> {
  try {
    return await sandbox.fs.downloadFile(path);
  } catch (_err) {
    const cmd = `base64 -w0 ${shellQuote(path)} 2>/dev/null || base64 ${shellQuote(path)}`;
    const res = await sandbox.exec(cmd, { timeoutSeconds: 60, cwd });
    if (res.exitCode !== 0) {
      throw new Error(`downloadFileSafe failed: ${String(res.result)}`);
    }
    const b64 = (res.result || '').toString().trim();
    return Buffer.from(b64, 'base64');
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

      const buffer = await downloadFileSafe(sandbox, entryPath);
      const relative = posix.relative(normalizedRoot, entryPath);
      const normalizedRelative = relative
        ? `/${relative.split(posix.sep).join('/')}`
        : '/';
      manifest[normalizedRelative] = {
        hash: createHash('sha256').update(buffer).digest('hex').slice(0, 32),
        size: buffer.length,
      };
      files.push({
        path: normalizedRelative,
        base64: buffer.toString('base64'),
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

async function readFirstExistingFile(
  sandbox: SandboxInstance,
  candidatePaths: string[],
  workingDir: string
): Promise<{ path: string; content: string }> {
  for (const p of candidatePaths) {
    try {
      const buf = await downloadFileSafe(sandbox, p, workingDir);
      return { path: p, content: buf.toString('utf8') };
    } catch {}
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

async function pm2JList(
  sandbox: SandboxInstance,
  cwd: string
): Promise<any[]> {
  try {
    const out = await sandbox.exec("pm2 jlist", { timeoutSeconds: 30, cwd });
    try {
      const parsed = JSON.parse(out.result);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

async function isPm2Online(
  sandbox: SandboxInstance,
  cwd: string,
  name: string
): Promise<boolean> {
  const list = await pm2JList(sandbox, cwd);
  const proc = Array.isArray(list)
    ? list.find((p: any) => p?.name === name)
    : undefined;
  const status = proc?.pm2_env?.status;
  return status === "online";
}

async function ensurePm2Process(
  sandbox: SandboxInstance,
  cwd: string,
  name: string,
  command: string
): Promise<void> {
  const online = await isPm2Online(sandbox, cwd, name);
  if (online) {
    return;
  }
  const startCmd = `pm2 start "${command}" --name ${name} --update-env`;
  await sandbox.exec(startCmd, { timeoutSeconds: 5 * 60, cwd });
}

async function getOrCreateSandbox(options: {
  port: number;
  workingDirectory: string;
  sandboxId?: string;
  env?: Record<string, string>;
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
      sandbox = await provider.create(options.env, options.workingDirectory);
    }
  } else {
    sandbox = await provider.create(options.env, options.workingDirectory);
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
    env: process.env.APIFY_TOKEN ? { APIFY_TOKEN: process.env.APIFY_TOKEN } : undefined,
  });

  const provider = createDaytonaProvider({
    apiKey: config.daytona.apiKey,
    serverUrl: config.daytona.serverUrl,
  });

  const sandbox = await provider.get(base.sandboxId);

  if (args.githubUrl) {
    await sandbox.git.clone(args.githubUrl, workingDirectory);
  }

  // Read surgent.json for init, dev scripts, and name
  let initScript: string | undefined;
  let devScript: string | undefined;
  let processName = `${projectId}-vite-server`;
  try {
    const buffer = await sandbox.exec(`cat ${workingDirectory}/surgent.json`, { timeoutSeconds: 10 });
    const config = JSON.parse(stripJsonComments(buffer.result));

    console.log("config", config);
    initScript = config?.scripts?.init;
    devScript = config?.scripts?.dev;
    if (typeof config?.name === "string" && config.name.trim()) {
      processName = config.name.trim();
    }
  } catch {
    // no surgent.json
  }

  console.log("initScript", initScript);
  console.log("devScript", devScript);
  console.log("processName", processName);

  // Run init script
  if (initScript) {
    const initResult = await sandbox.exec(
      buildBashCommand(workingDirectory, initScript),
      { timeoutSeconds: 30 * 60 }
    );
    console.log("initResult", initResult.exitCode);
  }

  // Start dev server with PM2
  if (devScript) {
    await ensurePm2Process(
      sandbox,
      workingDirectory,
      processName,
      devScript
    );
    await ensurePm2Process(
      sandbox,
      workingDirectory,
      "agent-opencode-server",
      "opencode serve --hostname 0.0.0.0 --port 4096"
    );

    try {
      const opencodeUrl = await sandbox.getHost(4096);
      const apiKey = process.env.OPENAI_API_KEY;

      // Persist API key via auth.set (server-side stored in auth.json)
      if (apiKey) {
        await fetch(`${opencodeUrl}/auth/openai?directory=${encodeURIComponent(workingDirectory)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "api", key: apiKey }),
          },
        ).catch(() => {});
        // console.log("authResponse", authResponse);
      }
    } catch (err) {
      console.log("[init] opencode provider auth/config update failed", err);
    }
  }

  // Conditionally provision Convex dev deployment
  let convexMetadata: any;
  if (args.initConvex) {
    const convexProject = await createProjectOnTeam({ name: args.name || "app", deploymentType: "dev" });
    const deployKey = await createDeployKey(convexProject.deploymentName);
    
    const envContent = [
      `CONVEX_DEPLOYMENT=${convexProject.deploymentName}`,
      `CONVEX_URL=${convexProject.deploymentUrl}`,
      `CONVEX_DEPLOY_KEY=${deployKey}`,
      `VITE_CONVEX_URL=${convexProject.deploymentUrl}`,
      `VITE_APP_URL=${base.previewUrl}`,
    ].join("\n") + "\n";
    
    const writeEnvCmd = `printf %s ${shellQuote(envContent)} > .env.local`;
    await sandbox.exec(buildBashCommand(workingDirectory, writeEnvCmd), { timeoutSeconds: 30 });

    // Bootstrap Convex Auth env vars (JWKS, JWT_PRIVATE_KEY, SANDBOX_PREVIEW_URL)
    try {
      const { jwks, privateKey } = await generateJwks();
      await setDeploymentEnvVars(convexProject.deploymentUrl, deployKey, {
        JWKS: jwks,
        JWT_PRIVATE_KEY: privateKey,
        SANDBOX_PREVIEW_URL: base.previewUrl,
      });
    } catch (err) {
      console.error('[convex] env bootstrap failed', err);
    }

    convexMetadata = {
      projectId: convexProject.projectId,
      projectSlug: convexProject.projectSlug,
      deploymentName: convexProject.deploymentName,
      deploymentUrl: convexProject.deploymentUrl,
      deployKey,
    };

    // Run Convex codegen and sync
    const codegen = await sandbox.exec("bun run convex:codegen", { cwd: workingDirectory, timeoutSeconds: 120 });
    if (codegen.exitCode !== 0) {
      console.error("[convex] codegen failed", String(codegen.result).slice(0, 500));
    } else {
      console.log("[convex] codegen completed");
    }
    const sync = await sandbox.exec("bun run convex:once", { cwd: workingDirectory, timeoutSeconds: 180 });
    if (sync.exitCode !== 0) {
      console.error("[convex] sync failed", String(sync.result).slice(0, 500));
    } else {
      console.log("[convex] sync completed");
    }
  }


  // Persist metadata
  const current = await ProjectService.getProjectById(projectId);
  await ProjectService.updateProjectMetadata(projectId, {
    ...(current?.metadata as any),
    workingDirectory,
    processName,
    startCommand: devScript,
    ...(convexMetadata && { convex: convexMetadata }),
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
    env: process.env.APIFY_TOKEN ? { APIFY_TOKEN: process.env.APIFY_TOKEN } : undefined,
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
      await ensurePm2Process(
        sandbox,
        workingDirectory,
        processName,
        startCommand
      );
    }

    await ensurePm2Process(
      sandbox,
      workingDirectory,
      "agent-opencode-server",
      "opencode serve --hostname 0.0.0.0 --port 4096"
    );
  } catch (err) {
    console.log("resumeProject pm2 start error", err);
  }

  return { sandboxId: base.sandboxId, previewUrl: base.previewUrl };
}

/**
 * Generate RS256 JWKS for Convex Auth
 */
async function generateJwks(): Promise<{ jwks: string; privateKey: string }> {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicKey = await exportJWK(keys.publicKey);
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] });
  
  return {
    jwks,
    privateKey: privateKey.trimEnd().replace(/\n/g, ' '),
  };
}

/**
 * Promote current functions to production via Convex CLI
 */
export async function deployConvexProd(args: { projectId: string }): Promise<void> {
  const project = await ProjectService.getProjectById(args.projectId);
  if (!project) throw new Error(`Project ${args.projectId} not found`);
  const sandboxId = (project.sandbox as any)?.id;
  if (!sandboxId) throw new Error("Sandbox not found");

  const provider = createDaytonaProvider({ apiKey: config.daytona.apiKey, serverUrl: config.daytona.serverUrl });
  const sandbox = await provider.resume(sandboxId);
  const cwd = (project.metadata as any)?.workingDirectory || localWorkspacePath(args.projectId);

  const res = await sandbox.exec('bunx convex deploy -y', { cwd, timeoutSeconds: 180_000 });
  if (res.exitCode !== 0) {
    throw new Error(`convex deploy failed: ${String(res.result)}`);
  }
}
