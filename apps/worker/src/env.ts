import { Sandbox } from "./sandbox";

export interface Env {
	dispatcher: DispatchNamespace;
	sandbox: Sandbox;
	DISPATCH_NAMESPACE_NAME?: string;
	CLOUDFLARE_ACCOUNT_ID?: string;
	CLOUDFLARE_API_TOKEN?: string;
}

export interface DispatchNamespace {
	get(name: string): NamespaceWorker;
}

export interface NamespaceWorker {
	fetch(request: Request): Promise<Response>;
}
