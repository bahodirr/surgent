import { deployToDispatch, buildDeploymentConfig, parseWranglerConfig } from '../services/deployer/deploy';
import { Configuration, SandboxApi } from '@daytonaio/api-client';
import type { AssetManifest, WranglerConfig } from '../services/deployer/types';
import type { Env } from './env';

interface DeployFileEntry {
	path: string;
	base64: string;
}

interface DeployModuleEntry {
	name: string;
	content: string;
}

interface DeployRequestBody {
	wranglerConfig: string | WranglerConfig;
	workerContent: string;
	assetsManifest?: AssetManifest;
	files?: DeployFileEntry[];
	additionalModules?: DeployModuleEntry[];
	compatibilityFlags?: string[];
	assetsConfig?: WranglerConfig['assets'];
	dispatchNamespace?: string;
	accountId?: string;
	apiToken?: string;
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const;
const DEFAULT_WARMUP_TIMEOUT_MS = 5000;
const DEFAULT_WARMUP_RETRY_MS = 250;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/health') {
			return new Response('ok');
		}

		if (url.pathname === '/deploy' && request.method === 'POST') {
			return handleDeployRequest(request, env);
		}

		// Route: preview subdomains -> Daytona preview proxy; else dispatch
		const subdomain = extractSubdomain(url.hostname);
		if (subdomain && isPreviewSubdomain(subdomain)) {
			return handlePreviewProxy(request, env);
		}

		return handleDispatchRequest(request, env);
	},
} ;
// satisfies ExportedHandler<Env>

async function handleDeployRequest(request: Request, env: Env): Promise<Response> {
	try {
		const body = (await request.json()) as DeployRequestBody;

		const accountId = env.CLOUDFLARE_ACCOUNT_ID;
		const apiToken = env.CLOUDFLARE_API_TOKEN;
		if (!accountId || !apiToken) {
			return new Response(
				JSON.stringify({ error: 'Missing Cloudflare credentials' }),
				{ status: 400, headers: JSON_HEADERS },
			);
		}

		const dispatchNamespace = body.dispatchNamespace ?? env.DISPATCH_NAMESPACE_NAME;
		if (!dispatchNamespace) {
			return new Response(
				JSON.stringify({ error: 'Dispatch namespace is required' }),
				{ status: 400, headers: JSON_HEADERS },
			);
		}

		const wranglerConfig =
			typeof body.wranglerConfig === 'string'
				? parseWranglerConfig(body.wranglerConfig)
				: body.wranglerConfig;

		const fileContents = buildFileMap(body.files);
		const additionalModules = buildModuleMap(body.additionalModules);

		const deployConfig = buildDeploymentConfig(
			wranglerConfig,
			body.workerContent,
			accountId,
			apiToken,
			body.assetsManifest,
			body.compatibilityFlags,
		);

		await deployToDispatch(
			{ ...deployConfig, dispatchNamespace },
			fileContents,
			additionalModules,
			body.assetsConfig,
		);

		return new Response(
			JSON.stringify({ success: true }),
			{ headers: JSON_HEADERS },
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : 'Deployment failed',
			}),
			{ status: 500, headers: JSON_HEADERS },
		);
	}
}

function buildFileMap(entries: DeployFileEntry[] | undefined): Map<string, Buffer> | undefined {
	if (!entries || entries.length === 0) {
		return undefined;
	}

	const map = new Map<string, Buffer>();
	for (const file of entries) {
		map.set(file.path, Buffer.from(file.base64, 'base64'));
	}
	return map;
}

function buildModuleMap(entries: DeployModuleEntry[] | undefined): Map<string, string> | undefined {
	if (!entries || entries.length === 0) {
		return undefined;
	}

	const map = new Map<string, string>();
	for (const mod of entries) {
		map.set(mod.name, mod.content);
	}
	return map;
}

async function handleDispatchRequest(request: Request, env: Env): Promise<Response> {
	if (!env.dispatcher) {
		return new Response('Dispatcher binding is not configured.', { status: 500 });
	}

	const url = new URL(request.url);
	const hostname = url.hostname;
	let targetRequest = request;
	let workerName = extractSubdomain(hostname);

	if (!workerName) {
		const fallback = extractWorkerFromPath(url, request);
		if (fallback) {
			({ workerName, targetRequest } = fallback);
		}
	}

	if (!workerName) {
		console.log('Not Found', hostname);
		return new Response('Not Found', { status: 404 });
	}

	try {
		const worker = env.dispatcher.get(workerName);
		return await worker.fetch(targetRequest);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return new Response(
			`Dispatch failed: ${message} ${hostname} ${workerName}`,
			{ status: 502 },
		);
	}
}

function extractSubdomain(hostname: string): string | null {
	const parts = hostname.split('.');
	if (parts.length < 2) {
		return null;
	}
	return parts[0] || null;
}

function extractWorkerFromPath(
	url: URL,
	request: Request,
): { workerName: string; targetRequest: Request } | null {
	const segments = url.pathname.split('/').filter(Boolean);
	if (segments.length === 0) {
		return null;
	}

	const [workerName, ...rest] = segments;
	if (!workerName) {
		return null;
	}

	url.pathname = rest.length > 0 ? `/${rest.join('/')}` : '/';
	const targetRequest = new Request(url.toString(), request);
	return { workerName, targetRequest };
}

function isPreviewSubdomain(sub: string): boolean {
	// Matches: preview-*, or <port>-<sandboxId>
	if (sub.startsWith('preview-')) return true;
	const segments = sub.split('-');
	return segments.length > 1 && /^\d+$/.test(segments[0]);
}

function getSandboxIdAndPortFromHost(host: string, defaultPort: number) {
	const parts = host.split(':')[0];
	const subdomain = parts.split('.')[0];
	const segments = subdomain.split('-');
	const first = segments[0];
	if (/^\d+$/.test(first) && segments.length >= 2) {
		return { sandboxId: segments.slice(1).join('-'), port: parseInt(first, 10) };
	}
	return { sandboxId: subdomain, port: defaultPort };
}

async function handlePreviewProxy(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const defaultPort = Number(env.DEFAULT_SANDBOX_PORT || '3000');
	const { sandboxId, port } = getSandboxIdAndPortFromHost(url.hostname, defaultPort);

	if (!env.DAYTONA_API_URL || !env.DAYTONA_API_KEY) {
		return new Response('Daytona not configured', { status: 500 });
	}

	try {
		const sandboxApi = createDaytonaSandboxApi(env);
		await ensureSandboxRunning(sandboxApi, sandboxId);
		const preview = await resolvePreview(sandboxApi, sandboxId, port);

		// Build target and forward headers
		const target = buildTargetUrl(preview.url, url.pathname, url.search);
		let proxied = new Request(target, request);
		const headers = new Headers(proxied.headers);
		headers.set('x-daytona-preview-token', preview.token);
		headers.set('x-daytona-skip-preview-warning', 'true');
		headers.delete('host');
		proxied = new Request(proxied, { headers });

		// WS pass-through
		if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
			return await fetch(proxied);
		}

		// HTTP warmup
		const warmupMs = DEFAULT_WARMUP_TIMEOUT_MS;
		const retryMs = DEFAULT_WARMUP_RETRY_MS;
		return await fetchWithWarmup(target, proxied, warmupMs, retryMs);
	} catch (e) {
		return new Response('Upstream unavailable', { status: 502 });
	}
}

function createDaytonaSandboxApi(env: Env): SandboxApi {
    const basePath = env.DAYTONA_API_URL || 'https://app.daytona.io/api';
    const apiKey = env.DAYTONA_API_KEY || '';
    return new SandboxApi(new Configuration({
        basePath,
        baseOptions: { headers: { Authorization: `Bearer ${apiKey}` } },
    }));
}

async function ensureSandboxRunning(sandboxApi: SandboxApi, sandboxId: string): Promise<void> {
    try {
        const info = await sandboxApi.getSandbox(sandboxId);
        const state = String((info.data as any)?.state || '').toLowerCase();
        if (state === 'stopped' || state === 'archived') {
            try {
                await sandboxApi.startSandbox(sandboxId);
            } catch {
                // ignore if already running
            }
        }
    } catch {
        // ignore state fetch errors
    }
}

async function resolvePreview(sandboxApi: SandboxApi, sandboxId: string, port: number): Promise<{ url: string; token: string; }> {
    const resp = await sandboxApi.getPortPreviewUrl(sandboxId, port);
    return { url: resp.data.url as string, token: resp.data.token as unknown as string };
}

function buildTargetUrl(baseUrl: string, path: string, search: string) {
	const u = new URL(baseUrl);
	const joinedPath = `${u.pathname.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
	u.pathname = joinedPath;
	u.search = search || '';
	return u.toString();
}

async function fetchWithWarmup(targetUrl: string, proxied: Request, timeoutMs: number, retryMs: number): Promise<Response> {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		try {
			const resp = await fetch(proxied);
			if (resp.status !== 404 && resp.status < 500) return resp;
			if (Date.now() >= deadline) return resp;
		} catch (e) {
			if (Date.now() >= deadline) throw e;
		}
		await new Promise(res => setTimeout(res, retryMs));
	}
}
