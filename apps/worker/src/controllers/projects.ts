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
import { auth } from "@/lib/auth";

// ============================================================================
// Types
// ============================================================================

export interface InitializeProjectArgs {
  githubUrl: string;
  userId: string;
  name?: string;
  initConvex?: boolean;
  headers?: Headers;
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
    await ProjectService.updateProject(args.projectId, {
      sandbox: { ...project.sandbox, deployed: true, deployName: normalizedDeployName },
      deployment: { ...(project.deployment || {}), status: "deployed", updatedAt: new Date() },
    });

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
  command: string,
  forceRestart = false
): Promise<void> {
  const online = await isPm2Online(sandbox, cwd, name);
  if (online) {
    if (forceRestart) {
      await sandbox.exec(`pm2 restart ${name} --update-env`, { timeoutSeconds: 60, cwd });
    }
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
  name?: string;
}): Promise<{ sandbox: SandboxInstance; previewUrl: string }> {
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
      sandbox = await provider.create(options.env, options.workingDirectory, options.name);
    }
  } else {
    sandbox = await provider.create(options.env, options.workingDirectory, options.name);
  }

  const previewUrl = await sandbox.getHost(options.port);

  return { sandbox, previewUrl };
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
  const sandboxName = "server"

  // Create Surgent API key for the user
  const apiKeyResult = await auth.api.createApiKey({
    body: { name: `p-${projectId.slice(0, 8)}` },
    headers: args.headers,
  });

  const { sandbox, previewUrl } = await getOrCreateSandbox({
    port: 3000,
    workingDirectory,
    name: sandboxName,
    env: {
      SURGENT_API_KEY: apiKeyResult.key,
      SURGENT_AI_BASE_URL: "https://ai.surgent.dev",
    },
  });

  if (args.githubUrl) {
    await sandbox.git.clone(args.githubUrl, workingDirectory);
  }

  // Read surgent.json for init, dev scripts, and name
  let initScript: string | undefined;
  let devScript: string | undefined;
  let processName = `${projectId}-vite-server`;
  try {
    const buffer = await sandbox.exec(`cat ${workingDirectory}/surgent.json`, { timeoutSeconds: 10 });
    const cfg = JSON.parse(stripJsonComments(buffer.result));
    initScript = cfg?.scripts?.init;
    devScript = cfg?.scripts?.dev;
    if (cfg?.name?.trim()) processName = cfg.name.trim();
  } catch {
    // no surgent.json
  }

  // Run init script
  if (initScript) {
    await sandbox.exec(buildBashCommand(workingDirectory, initScript), { timeoutSeconds: 30 * 60 });
  }

  // Provision Convex BEFORE starting dev server (so .env.local exists)
  let convexMetadata: any;
  if (args.initConvex) {
    const convexProject = await createProjectOnTeam({ name: args.name || "app", deploymentType: "dev" });
    const deployKey = await createDeployKey(convexProject.deploymentName);
    
    const envContent = [
      `CONVEX_DEPLOYMENT=${convexProject.deploymentName}`,
      `CONVEX_URL=${convexProject.deploymentUrl}`,
      `CONVEX_DEPLOY_KEY=${deployKey}`,
      `VITE_CONVEX_URL=${convexProject.deploymentUrl}`,
      `VITE_APP_URL=${previewUrl}`,
    ].join("\n") + "\n";
    
    await sandbox.exec(buildBashCommand(workingDirectory, `printf %s ${shellQuote(envContent)} > .env.local`), { timeoutSeconds: 30 });

    // Bootstrap Convex Auth env vars
    try {
      const { jwks, privateKey } = await generateJwks();
      await setDeploymentEnvVars(convexProject.deploymentUrl, deployKey, {
        JWKS: jwks,
        JWT_PRIVATE_KEY: privateKey,
        SANDBOX_PREVIEW_URL: previewUrl,
      });
    } catch (err) {
      console.error('[convex] env bootstrap failed', err);
    }

    // Run Convex codegen and sync
    await sandbox.exec("bun run convex:codegen", { cwd: workingDirectory, timeoutSeconds: 120 });
    await sandbox.exec("bun run convex:once", { cwd: workingDirectory, timeoutSeconds: 180 });

    convexMetadata = {
      projectId: convexProject.projectId,
      projectSlug: convexProject.projectSlug,
      deploymentName: convexProject.deploymentName,
      deploymentUrl: convexProject.deploymentUrl,
      deployKey,
    };
  }

  // Start dev server
  if (devScript) {
    await ensurePm2Process(sandbox, workingDirectory, processName, devScript);

    // Start opencode agent with config
    await sandbox.exec("bun install -g opencode-ai@latest", { timeoutSeconds: 120 });
    await ensurePm2Process(sandbox, workingDirectory, "agent-opencode-server", "opencode serve --hostname 0.0.0.0 --port 4096");

    const opencodeUrl = await sandbox.getHost(4096);
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`${opencodeUrl}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: {
            openai: {
              options: {
                apiKey: apiKeyResult.key,
                baseURL: "https://ai.surgent.dev/openai",
              },
            },  
            google: {
              options: {
                apiKey: apiKeyResult.key,
                baseURL: "https://ai.surgent.dev/google",
              },
            },
            anthropic: {
              options: {
                apiKey: apiKeyResult.key,
                baseURL: "https://ai.surgent.dev/anthropic",
              },
            },
            vercel: {
              options: {
                apiKey: apiKeyResult.key,
                baseURL: "https://ai.surgent.dev/vercel",
              },
            },
            xai: {
              options: {
                apiKey: apiKeyResult.key,
                baseURL: "https://ai.surgent.dev/xai",
              },
            },
            'zai-org': {
              options: {
                apiKey: apiKeyResult.key,
                baseURL: "https://ai.surgent.dev/zai-org",
              },
            },
          },
        }),
      });
      if (!res.ok) console.error("[opencode] config failed:", res.status, await res.text());
    } catch (err) {
      console.error("[opencode] config error:", err);
    }
  }

  // Persist state (single DB update)
  await ProjectService.updateProject(projectId, {
    metadata: {
      workingDirectory,
      processName,
      startCommand: devScript,
      ...(convexMetadata ? { convex: convexMetadata } : {}),
    },
    sandbox: {
      id: sandbox.sandboxId,
      previewUrl,
      status: "started",
      isInitialized: true,
    },
  });

  return { projectId, sandboxId: sandbox.sandboxId, previewUrl };
}

/**
 * Resume a project sandbox and restart processes
 */
export async function resumeProject(
  args: ResumeProjectArgs
): Promise<{ sandboxId: string; previewUrl: string }> {
  const workingDirectory = localWorkspacePath(args.projectId);

  const { sandbox, previewUrl } = await getOrCreateSandbox({
    sandboxId: args.sandboxId,
    port: 3000,
    workingDirectory,
    name: "server",
  });

  // Load project metadata and start processes
  try {
    const project = await ProjectService.getProjectById(args.projectId);
    const startCommand = (project?.metadata as any)?.startCommand;
    const processName = (project?.metadata as any)?.processName;

    if (startCommand && processName) {
      await ensurePm2Process(sandbox, workingDirectory, processName, startCommand);
    }

    await sandbox.exec("bun update -g opencode-ai@latest", { timeoutSeconds: 120 });
    await ensurePm2Process(sandbox, workingDirectory, "agent-opencode-server", "opencode serve --hostname 0.0.0.0 --port 4096", true);
  } catch (err) {
    console.log("resumeProject pm2 start error", err);
  }

  return { sandboxId: sandbox.sandboxId, previewUrl };
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
  const cwd = project.metadata?.workingDirectory || localWorkspacePath(args.projectId);

  const res = await sandbox.exec('bunx convex deploy -y', { cwd, timeoutSeconds: 180_000 });
  if (res.exitCode !== 0) {
    throw new Error(`convex deploy failed: ${String(res.result)}`);
  }
}
