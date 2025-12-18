import { createDaytonaProvider } from "@/apis/sandbox";
import type { SandboxInstance } from "@/apis/sandbox";
import { config } from "@/lib/config";
import { Daytona } from "@daytonaio/sdk";
import path from "path";
import { createHash } from "crypto";
import stripJsonComments from "strip-json-comments";
import * as ProjectService from "@/services/projects";
import ky from "ky";

const MAX_PROJECTS_PER_USER = 2;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
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

// ============================================================================
// Helpers
// ============================================================================

const posix = path.posix;

function localWorkspacePath(projectId: string): string {
  return posix.join("/tmp", projectId.replace(/[^a-zA-Z0-9_-]+/g, "-") || "project");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function buildBashCommand(cwd: string, script: string): string {
  return `bash -lc '${["set -euo pipefail", `cd ${shellQuote(cwd)}`, script].join("\n").replace(/'/g, "'\"'\"'")}'`;
}

function getDaytonaProvider() {
  return createDaytonaProvider({
    apiKey: config.daytona.apiKey,
    serverUrl: config.daytona.serverUrl,
    snapshot: config.daytona.snapshot,
  });
}

function getDaytonaClient(): Daytona {
  return new Daytona({ apiKey: config.daytona.apiKey, apiUrl: config.daytona.serverUrl });
}

function isDirectory(entry: unknown): boolean {
  const info = entry as Record<string, any>;
  return info?.isDir === true || info?.is_dir === true || info?.type === "directory";
}

function stripTrailingSlash(s: string): string {
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

function resolveEntryPath(currentDir: string, entry: unknown): string {
  const info = entry as Record<string, any>;
  if (typeof info.path === "string" && info.path) return info.path;
  const name = typeof info.name === "string" ? info.name : "";
  return name ? posix.join(stripTrailingSlash(currentDir), name) : currentDir;
}

function sanitizeScriptName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

async function directoryExists(sandbox: SandboxInstance, dir: string): Promise<boolean> {
  try {
    return isDirectory(await sandbox.fs.getFileDetails(dir));
  } catch {
    return false;
  }
}

async function downloadFileSafe(sandbox: SandboxInstance, filePath: string, cwd?: string): Promise<Buffer> {
  try {
    return await sandbox.fs.downloadFile(filePath);
  } catch {
    const cmd = `base64 -w0 ${shellQuote(filePath)} 2>/dev/null || base64 ${shellQuote(filePath)}`;
    const res = await sandbox.exec(cmd, { timeoutSeconds: 60, cwd });
    if (res.exitCode !== 0) throw new Error(`downloadFileSafe failed: ${res.result}`);
    return Buffer.from((res.result || '').toString().trim(), 'base64');
  }
}

async function readFirstExistingFile(sandbox: SandboxInstance, paths: string[], cwd: string): Promise<{ path: string; content: string }> {
  for (const p of paths) {
    try {
      return { path: p, content: (await downloadFileSafe(sandbox, p, cwd)).toString('utf8') };
    } catch {}
  }
  throw new Error(`Required file not found. Tried: ${paths.join(", ")}`);
}

async function collectAssets(sandbox: SandboxInstance, rootDir: string) {
  const root = stripTrailingSlash(rootDir);
  const manifest: Record<string, { hash: string; size: number }> = {};
  const files: Array<{ path: string; base64: string }> = [];

  async function walk(dir: string) {
    for (const entry of await sandbox.fs.listFiles(dir)) {
      const entryPath = resolveEntryPath(dir, entry);
      if (isDirectory(entry)) {
        await walk(entryPath);
      } else {
        const buffer = await downloadFileSafe(sandbox, entryPath);
        const rel = `/${posix.relative(root, entryPath)}`;
        manifest[rel] = { hash: createHash('sha256').update(buffer).digest('hex').slice(0, 32), size: buffer.length };
        files.push({ path: rel, base64: buffer.toString('base64') });
      }
    }
  }

  await walk(rootDir);
  return { manifest, files };
}

async function pm2JList(sandbox: SandboxInstance, cwd: string): Promise<any[]> {
  try {
    const out = await sandbox.exec("pm2 jlist", { timeoutSeconds: 30, cwd });
    const parsed = JSON.parse(out.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function isPm2Online(sandbox: SandboxInstance, cwd: string, name: string): Promise<boolean> {
  const list = await pm2JList(sandbox, cwd);
  return list.find(p => p?.name === name)?.pm2_env?.status === "online";
}

async function waitForServer(url: string, maxAttempts = 10, delayMs = 200): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

async function ensurePm2Process(sandbox: SandboxInstance, cwd: string, name: string, command: string, forceRestart = false) {
  if (await isPm2Online(sandbox, cwd, name)) {
    if (forceRestart) await sandbox.exec(`pm2 restart ${name} --update-env`, { timeoutSeconds: 60, cwd });
    return;
  }
  await sandbox.exec(`pm2 start "${command}" --name ${name} --update-env`, { timeoutSeconds: 300, cwd });
}

async function getOrCreateSandbox(opts: { port: number; workingDirectory: string; sandboxId?: string; env?: Record<string, string>; name?: string }) {
  const provider = getDaytonaProvider();
  let sandbox: SandboxInstance;

  if (opts.sandboxId) {
    try {
      sandbox = await provider.resume(opts.sandboxId);
    } catch {
      sandbox = await provider.create(opts.env, opts.workingDirectory, opts.name);
    }
  } else {
    sandbox = await provider.create(opts.env, opts.workingDirectory, opts.name);
  }

  return { sandbox, previewUrl: await sandbox.getHost(opts.port) };
}

async function configureOpencode(sandbox: SandboxInstance, cwd: string) {
  const openaiKey = config.llms.openaiKey;
  const googleKey = config.llms.googleKey;
  
  if (!openaiKey && !googleKey) return;

  try {
    const url = await sandbox.getHost(4096);
    await waitForServer(url);

    const requests = [];
    const opts = (key: string) => ({
      searchParams: { directory: cwd },
      json: { type: "api", key },
      retry: { limit: 3, methods: ["put"] },
    });

    if (openaiKey) {
      requests.push(ky.put(`${url}/auth/openai`, opts(openaiKey)).catch(() => {}));
    }
    if (googleKey) {
      requests.push(ky.put(`${url}/auth/google`, opts(googleKey)).catch(() => {}));
    }
    await Promise.all(requests);
  } catch (err) {
    console.log("[opencode] auth configuration failed", err);
  }
}

async function generateJwks(): Promise<{ jwks: string; privateKey: string }> {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicKey = await exportJWK(keys.publicKey);
  return {
    jwks: JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] }),
    privateKey: privateKey.trimEnd().replace(/\n/g, ' '),
  };
}

// ============================================================================
// Main Functions
// ============================================================================

export async function deployProject(args: DeployProjectArgs): Promise<void> {
  let step = "start";
  console.log("[deploy] start", args);

  const project = await ProjectService.getProjectById(args.projectId);
  if (!project) throw new Error(`Project ${args.projectId} not found`);

  const sandboxId = project.sandbox?.id;
  if (!sandboxId) throw new Error("Project sandbox is not initialized");

  const deployName = args.deployName ? sanitizeScriptName(args.deployName) : undefined;
  const workingDir = localWorkspacePath(args.projectId);

  try {
    step = "status:starting";
    await ProjectService.updateDeploymentStatus(args.projectId, "starting", deployName);

    step = "resume";
    const sandbox = await getDaytonaProvider().resume(sandboxId);

    step = "status:building";
    await ProjectService.updateDeploymentStatus(args.projectId, "building");

    step = "build";
    const buildResult = await sandbox.exec(`bun run build`, { cwd: workingDir, timeoutSeconds: 180_000 });
    if (buildResult.exitCode !== 0) {
      await ProjectService.updateDeploymentStatus(args.projectId, "build_failed");
      throw new Error(`Build failed: ${String(buildResult.result).slice(0, 500)}`);
    }

    step = "read:inputs";
    const [wranglerCat, workerCat] = await Promise.all([
      readFirstExistingFile(sandbox, [`${workingDir}/dist/vite_reference/wrangler.json`, `${workingDir}/wrangler.jsonc`, `${workingDir}/wrangler.json`], workingDir),
      readFirstExistingFile(sandbox, [`${workingDir}/dist/vite_reference/index.js`, `${workingDir}/dist/index.js`], workingDir),
    ]);

    step = "wrangler:parse";
    let wranglerConfig = wranglerCat.content;
    let compatibilityFlags: string[] | undefined;
    try {
      const parsed = JSON.parse(stripJsonComments(wranglerConfig));
      if (deployName) parsed.name = deployName;
      wranglerConfig = JSON.stringify(parsed);
      if (Array.isArray(parsed?.compatibility_flags)) compatibilityFlags = parsed.compatibility_flags;
    } catch {}

    step = "assets";
    let assetsManifest: Record<string, { hash: string; size: number }> | undefined;
    let files: Array<{ path: string; base64: string }> | undefined;
    const assetsRoot = `${workingDir}/dist/client`;
    if (await directoryExists(sandbox, assetsRoot)) {
      const collected = await collectAssets(sandbox, assetsRoot);
      if (Object.keys(collected.manifest).length) assetsManifest = collected.manifest;
      if (collected.files.length) files = collected.files;
    }

    step = "env:read";
    let envVars: Record<string, string> | undefined;
    try {
      envVars = parseDotEnv(await downloadFileSafe(sandbox, `${workingDir}/.env.local`, workingDir));
    } catch {}

    step = "status:uploading";
    await ProjectService.updateDeploymentStatus(args.projectId, "uploading");

    step = "deploy";
    const wrangler = parseWranglerConfig(wranglerConfig);
    const deployConfig = buildDeploymentConfig(wrangler, workerCat.content, config.cloudflare.accountId!, config.cloudflare.apiToken!, assetsManifest, compatibilityFlags);
    
    if (envVars && Object.keys(envVars).length) {
      deployConfig.vars = { ...envVars, ...deployConfig.vars };
    }

    const fileContents = files?.length ? new Map(files.map(f => [f.path, Buffer.from(f.base64, "base64")])) : undefined;
    await deployToDispatch({ ...deployConfig, dispatchNamespace: config.cloudflare.dispatchNamespace! }, fileContents, undefined, wrangler.assets);

    step = "status:deployed";
    await ProjectService.updateProject(args.projectId, {
      sandbox: { ...project.sandbox, deployed: true, deployName },
      deployment: { ...(project.deployment || {}), status: "deployed", updatedAt: new Date() },
    });

    console.log("[deploy] success", { projectId: args.projectId });
  } catch (err: any) {
    console.error("[deploy] failed", { projectId: args.projectId, step, error: err?.message ?? err });
    if (!step.startsWith("status:") && step !== "build") {
      try {
        await ProjectService.updateDeploymentStatus(args.projectId, "deploy_failed", undefined, { step, error: err?.message ?? String(err) });
      } catch {}
    }
    throw err;
  }
}

export async function setRunIndefinitely(sandboxId: string): Promise<{ sandboxId: string }> {
  const sandbox = await getDaytonaClient().get(sandboxId);
  await sandbox.setAutostopInterval(0);
  return { sandboxId };
}

export async function initializeProject(args: InitializeProjectArgs): Promise<{ projectId: string; sandboxId: string; previewUrl: string }> {
  const projectCount = await ProjectService.countProjectsByUserId(args.userId);
  if (projectCount >= MAX_PROJECTS_PER_USER) {
    throw new HttpError(400, `Project limit reached. Maximum ${MAX_PROJECTS_PER_USER} projects per user.`);
  }

  const created = await ProjectService.createProject({ userId: args.userId, name: args.name || "app", githubUrl: args.githubUrl });
  const projectId = created.id;
  const workingDirectory = localWorkspacePath(projectId);

  const apiKeyResult = await auth.api.createApiKey({ body: { name: `p-${projectId.slice(0, 8)}` }, headers: args.headers });

  const { sandbox, previewUrl } = await getOrCreateSandbox({
    port: 3000,
    workingDirectory,
    name: "server",
    env: { SURGENT_API_KEY: apiKeyResult.key, SURGENT_AI_BASE_URL: "https://ai.surgent.dev" },
  });

  if (args.githubUrl) await sandbox.git.clone(args.githubUrl, workingDirectory);

  let initScript: string | undefined;
  let devScript: string | undefined;
  let processName = `${projectId}-vite-server`;
  try {
    const cfg = JSON.parse(stripJsonComments((await sandbox.exec(`cat ${workingDirectory}/surgent.json`, { timeoutSeconds: 10 })).result));
    initScript = cfg?.scripts?.init;
    devScript = cfg?.scripts?.dev;
    if (cfg?.name?.trim()) processName = cfg.name.trim();
  } catch {}

  if (initScript) await sandbox.exec(buildBashCommand(workingDirectory, initScript), { timeoutSeconds: 1800 });

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

    try {
      const { jwks, privateKey } = await generateJwks();
      await setDeploymentEnvVars(convexProject.deploymentUrl, deployKey, { JWKS: jwks, JWT_PRIVATE_KEY: privateKey, SANDBOX_PREVIEW_URL: previewUrl });
    } catch (err) {
      console.error('[convex] env bootstrap failed', err);
    }

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

  if (devScript) {
    await ensurePm2Process(sandbox, workingDirectory, processName, devScript);
    await sandbox.exec("bun install -g opencode-ai@latest", { timeoutSeconds: 120 });
    await ensurePm2Process(sandbox, workingDirectory, "agent-opencode-server", "opencode serve --hostname 0.0.0.0 --port 4096");
    await configureOpencode(sandbox, workingDirectory);
  }

  await ProjectService.updateProject(projectId, {
    metadata: { workingDirectory, processName, startCommand: devScript, ...(convexMetadata ? { convex: convexMetadata } : {}) },
    sandbox: { id: sandbox.sandboxId, previewUrl, status: "started", isInitialized: true },
  });

  return { projectId, sandboxId: sandbox.sandboxId, previewUrl };
}

export async function resumeProject(args: ResumeProjectArgs): Promise<{ sandboxId: string; previewUrl: string }> {
  const workingDirectory = localWorkspacePath(args.projectId);

  const { sandbox, previewUrl } = await getOrCreateSandbox({ sandboxId: args.sandboxId, port: 3000, workingDirectory, name: "server" });

  try {
    const project = await ProjectService.getProjectById(args.projectId);
    const { startCommand, processName } = (project?.metadata ?? {}) as any;

    if (startCommand && processName) {
      await ensurePm2Process(sandbox, workingDirectory, processName, startCommand);
    }

    await sandbox.exec("bun update -g opencode-ai@latest", { timeoutSeconds: 120 });
    await ensurePm2Process(sandbox, workingDirectory, "agent-opencode-server", "opencode serve --hostname 0.0.0.0 --port 4096", true);
    await configureOpencode(sandbox, workingDirectory);
  } catch (err) {
    console.log("[resume] pm2 start error", err);
  }

  return { sandboxId: sandbox.sandboxId, previewUrl };
}

export async function deployConvexProd(args: { projectId: string }): Promise<void> {
  const project = await ProjectService.getProjectById(args.projectId);
  if (!project) throw new Error(`Project ${args.projectId} not found`);

  const sandboxId = project.sandbox?.id;
  if (!sandboxId) throw new Error("Sandbox not found");

  const sandbox = await getDaytonaProvider().resume(sandboxId);
  const cwd = project.metadata?.workingDirectory || localWorkspacePath(args.projectId);

  const res = await sandbox.exec('bunx convex deploy -y', { cwd, timeoutSeconds: 180_000 });
  if (res.exitCode !== 0) throw new Error(`convex deploy failed: ${res.result}`);
}
