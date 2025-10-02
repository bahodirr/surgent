import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parse } from 'jsonc-parser';

type AssetManifest = Record<string, { hash: string; size: number }>;

type DeployPayload = {
  wranglerConfig: string;
  workerContent: string;
  assetsManifest?: AssetManifest;
  files?: Array<{ path: string; base64: string }>;
  compatibilityFlags?: string[];
  assetsConfig?: unknown;
};

type Options = {
  projectRoot: string;
  wranglerPath?: string;
  workerPath?: string;
  assetsDir?: string;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectAssets(assetsDir: string) {
  const manifest: AssetManifest = {};
  const files: Array<{ path: string; base64: string }> = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const relative = '/' + path.relative(assetsDir, fullPath).split(path.sep).join('/');
      const buffer = await fs.readFile(fullPath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);

      manifest[relative] = { hash, size: buffer.byteLength };
      files.push({ path: relative, base64: buffer.toString('base64') });
    }
  }

  await walk(assetsDir);
  return { manifest, files };
}

async function createDeployPayload(options: Options): Promise<DeployPayload> {
  const projectRoot = options.projectRoot;
  const wranglerPath = options.wranglerPath ?? path.join(projectRoot, 'wrangler.jsonc');
  const workerPath = options.workerPath ?? path.join(projectRoot, 'dist', 'index.js');
  const assetsDir = options.assetsDir ?? path.join(projectRoot, 'dist', 'client');

  if (!(await fileExists(wranglerPath))) {
    throw new Error(`Wrangler config not found at ${wranglerPath}`);
  }

  if (!(await fileExists(workerPath))) {
    throw new Error(`Worker bundle not found at ${workerPath}. Did you run the build?`);
  }

  const wranglerConfig = await fs.readFile(wranglerPath, 'utf8');
  const workerContent = await fs.readFile(workerPath, 'utf8');

  let assetsManifest: AssetManifest | undefined;
  let files: Array<{ path: string; base64: string }> | undefined;

  if (await fileExists(assetsDir)) {
    const assets = await collectAssets(assetsDir);
    assetsManifest = assets.manifest;
    files = assets.files;
  }

  let compatibilityFlags: string[] | undefined;
  let assetsConfig: unknown;

  try {
    const config = parse(wranglerConfig);
    if (Array.isArray(config?.compatibility_flags)) {
      compatibilityFlags = config.compatibility_flags;
    }
    if (config?.assets) {
      assetsConfig = config.assets;
    }
  } catch {
    // ignore parse errors
  }

  return {
    wranglerConfig,
    workerContent,
    assetsManifest,
    files,
    compatibilityFlags,
    assetsConfig,
  };
}

async function writePayload(payload: DeployPayload, filePath: string) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function main() {
  const [projectArg, outputArg] = process.argv.slice(2);
  const projectRoot = path.resolve(projectArg ?? process.cwd());
  const outputFile = path.resolve(outputArg ?? path.join(projectRoot, 'deploy-payload.json'));

  try {
    const payload = await createDeployPayload({ projectRoot });
    await writePayload(payload, outputFile);
    console.log(`Deployment payload written to ${outputFile}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[deploy-payload] ${message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}

export type { DeployPayload };
export { createDeployPayload };
