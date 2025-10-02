import { deployToDispatch, buildDeploymentConfig, parseWranglerConfig } from '../services/deployer/deploy';
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/health') {
			return new Response('ok');
		}

		if (url.pathname === '/deploy' && request.method === 'POST') {
			return handleDeployRequest(request, env);
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
