export interface Env {
	dispatcher: DispatchNamespace;
	DISPATCH_NAMESPACE_NAME?: string;
	CLOUDFLARE_ACCOUNT_ID?: string;
	CLOUDFLARE_API_TOKEN?: string;
	// Daytona preview proxy
	DAYTONA_API_URL?: string;
	DAYTONA_API_KEY?: string;
	DEFAULT_SANDBOX_PORT?: string;
}

export interface DispatchNamespace {
	get(name: string): NamespaceWorker;
}

export interface NamespaceWorker {
	fetch(request: Request): Promise<Response>;
}
