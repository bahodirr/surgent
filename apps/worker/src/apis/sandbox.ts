"use node"

import { Daytona, DaytonaConfig as DaytonaSDKConfig, Sandbox } from "@daytonaio/sdk";

export interface SandboxExecutionResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	cmdId?: string;
}

export interface SandboxCommandOptions {
	timeoutMs?: number;
	background?: boolean;
	onStdout?: (data: string) => void;
	onStderr?: (data: string) => void;
}

export interface ExecCommandOptions {
	timeoutSeconds?: number;
	cwd?: string;
	env?: Record<string, string>;
}

export interface SandboxInstance {
	id: string;
	sandboxId: string;
	exec(command: string, options?: ExecCommandOptions): Promise<{exitCode: number, result: any}>;
	getHost(port: number): Promise<string>;
	fs: Sandbox["fs"];
	git: Sandbox["git"];
}

export interface SandboxProvider {
	create(envs?: Record<string, string>, workingDirectory?: string, name?: string): Promise<SandboxInstance>;
	resume(id: string): Promise<SandboxInstance>;
	get(id: string): Promise<SandboxInstance>;
	stop(id: string): Promise<void>;
}

export interface DaytonaConfig {
	apiKey?: string;
	snapshot?: string;
	serverUrl?: string; // maps to Daytona SDK apiUrl
}

class DaytonaSandboxInstance implements SandboxInstance {
	public readonly id: string;
	public readonly sandbox: Sandbox;
	public readonly fs: Sandbox["fs"];
	public readonly git: Sandbox["git"];
	private client: Daytona;
	private readonly sessionId: string;

	constructor(sandbox: Sandbox, client: Daytona) {
		this.sandbox = sandbox;
		this.client = client;
		this.id = sandbox.id;
		this.fs = sandbox.fs;
		this.git = sandbox.git;
		this.sessionId = "default";
	}

	get sandboxId(): string {
		return this.id;
	}
	async exec(command: string, options?: ExecCommandOptions): Promise<{exitCode: number, result: any}> {
		const response = await this.sandbox.process.executeCommand(command, options?.cwd, options?.env, options?.timeoutSeconds);
		return {
			exitCode: response.exitCode ?? 0,
			result: response.result,
		};
	}
	async getHost(port: number): Promise<string> {
		const preview = await this.sandbox.getPreviewLink(port);
		return preview.url;
	}

	async kill(): Promise<void> {
		await this.sandbox.delete();
	}

	async pause(): Promise<void> {
		await this.sandbox.stop();
	}

	async start(): Promise<void> {
		await this.sandbox.start();
	}
}

export class DaytonaSandboxProvider implements SandboxProvider {
	private client?: Daytona;

	constructor(private config: DaytonaConfig) {}

	private getClient(): Daytona {
		if (!this.client) {
			const cfg: DaytonaSDKConfig = {};
			if (this.config.apiKey) cfg.apiKey = this.config.apiKey;
			if (this.config.serverUrl) cfg.apiUrl = this.config.serverUrl;
			this.client = new Daytona(cfg);
		}
		return this.client!;
	}

	async create(envs?: Record<string, string>, _workingDirectory?: string, name?: string): Promise<SandboxInstance> {
		const client = this.getClient();
		const params: any = {
			snapshot: this.config.snapshot || "default-env:1.0.0",
			envVars: envs || {},
			public: true,
			autoStopInterval: 15,
		};
		if (name) params.name = name;
		const sandbox = await client.create(params);
		return new DaytonaSandboxInstance(sandbox, client);
	}

	async resume(sandboxId: string): Promise<SandboxInstance> {
		const client = this.getClient();
		const sandbox = await client.get(sandboxId);
		const state = (sandbox.state || "").toString().toUpperCase();
		if (state === "STOPPED" || state === "ARCHIVED") {
			await sandbox.start();
		}
		return new DaytonaSandboxInstance(sandbox, client);
	}

	async get(sandboxId: string): Promise<SandboxInstance> {
		const client = this.getClient();
		const sandbox = await client.get(sandboxId);
		return new DaytonaSandboxInstance(sandbox, client);
	}

	async stop(sandboxId: string): Promise<void> {
		const client = this.getClient();
		const sandbox = await client.get(sandboxId);
		await sandbox.stop();
	}
}

export function createDaytonaProvider(config: DaytonaConfig): DaytonaSandboxProvider {
	return new DaytonaSandboxProvider(config);
}