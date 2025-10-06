"use node"

import {
  Daytona,
  DaytonaConfig as DaytonaSDKConfig,
  Sandbox,
} from "@daytonaio/sdk";

// Define the interfaces we need from the SDK
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

export interface SandboxCommands {
  run(
    command: string,
    options?: SandboxCommandOptions
  ): Promise<SandboxExecutionResult>;
}

export interface SandboxInstance {
  sandboxId: string;
  commands: SandboxCommands;
  kill(): Promise<void>;
  pause(): Promise<void>;
  getHost(port: number): Promise<string>;
  fs: Sandbox['fs'];
  git: Sandbox['git'];
}

export interface SandboxProvider {
  create(
    envs?: Record<string, string>,
    agentType?: "codex" | "claude" | "opencode" | "gemini" | "grok",
    workingDirectory?: string
  ): Promise<SandboxInstance>;
  resume(sandboxId: string): Promise<SandboxInstance>;
}

export type AgentType = "codex" | "claude" | "opencode" | "gemini" | "grok";

export interface DaytonaConfig {
  apiKey?: string;
  image?: string;
  snapshot?: string;
  serverUrl?: string;
  target?: string;
  networkAllowList?: string;
  networkBlockAll?: boolean;
}

// Helper function to get Docker image based on agent type
const getDockerImageFromAgentType = (agentType?: AgentType) => {
  if (agentType === "codex") {
    return "superagentai/vibekit-codex:1.0";
  } else if (agentType === "claude") {
    return "superagentai/vibekit-claude:1.0";
  } else if (agentType === "opencode") {
    return "superagentai/vibekit-opencode:1.0";
  } else if (agentType === "gemini") {
    return "superagentai/vibekit-gemini:1.1";
  } else if (agentType === "grok") {
    return "superagentai/vibekit-grok-cli:1.0";
  }
  return "ubuntu:22.04";
};

// Daytona implementation
class DaytonaSandboxInstance implements SandboxInstance {
  constructor(
    private sandbox: Sandbox, // Daytona workspace object
    private daytona: Daytona, // Daytona client
    public sandboxId: string,
    private envs?: Record<string, string> // Store environment variables
  ) {}

  get fs(): Sandbox['fs'] {
    return this.sandbox.fs;
  }

  get git(): Sandbox['git'] {
    return this.sandbox.git;
  }

  get commands(): SandboxCommands {
    return {
      run: async (command: string, options?: SandboxCommandOptions) => {
        // Ensure a session exists; ignore if it already exists
        try {
          await this.sandbox.process.createSession(this.sandboxId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("Daytona createSession error:", message);
          if (!message.toLowerCase().includes("session already exists") &&
              !message.toLowerCase().includes("409") &&
              !message.toLowerCase().includes("already")) {
            throw error;
          }
        }

        // Background execution with streaming; return immediately with cmdId
        if (options?.background) {
          console.log("Process in background started", command);
          
          const response = await this.sandbox.process.executeSessionCommand(
            this.sandboxId,
            {
              command: command,
              async: true,
            }
          );

          // Stream logs until the command completes (SDK resolves when exitCode is available) 
          // TODO: it worked after we did await, analyze why it was not working before. also we had added finalCmd to make it work, but it wasn't root cause. Just adding await fixed it.
          await this.sandbox.process.getSessionCommandLogs(
            this.sandboxId,
            response.cmdId!,
            (chunk) => {
              options?.onStdout?.(chunk);
            }
          );

          // Fetch final command state for exit code
          const finalCmd = await this.sandbox.process.getSessionCommand(
            this.sandboxId,
            response.cmdId!
          );

          return {
            exitCode: finalCmd?.exitCode ?? 0,
            stdout: "",
            stderr: "",
            cmdId: response.cmdId!,
          };
        }

        // Non-background execution (blocking). No live streaming available for sync path.
        try {
          const response = await this.sandbox.process.executeSessionCommand(
            this.sandboxId,
            {
              command: command,
              async: false,
            }
          );

          const result: SandboxExecutionResult = {
            exitCode: response.exitCode || 0,
            stdout: response.output || "",
            stderr: "",
          };
          return result;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          options?.onStdout?.(errorMessage);
          return {
            exitCode: 1,
            stdout: "",
            stderr: errorMessage,
          };
        }
      },
    };
  }

  async kill(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.delete();
    }
  }

  async pause(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.stop();
    }
  }
  async start(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.start();
    }
  }

  async getHost(port: number): Promise<string> {
    const previewLink = await this.sandbox.getPreviewLink(port);
    return previewLink.url;
  }
}

export class DaytonaSandboxProvider implements SandboxProvider {
  constructor(private config: DaytonaConfig) {}

  async create(
    envs?: Record<string, string>,
    agentType?: AgentType,
    workingDirectory?: string,
  ): Promise<SandboxInstance> {
    try {
      // Creating sandbox
      // Dynamic import to avoid dependency issues if daytona-sdk is not installed
      const daytonaConfig: DaytonaSDKConfig = {
        apiKey: this.config.apiKey,
        apiUrl: this.config.serverUrl || "https://app.daytona.io/api",
      };

      const daytona = new Daytona(daytonaConfig);

      // Determine default image based on agent type if not specified in config
      let image = this.config.image || getDockerImageFromAgentType(agentType);
      let params;

      // Ensure HOME is set for tools that rely on it (e.g., Claude CLI writes config)
      const mergedEnvs = {
        ...(envs || {}),
        // Do not override HOME to workingDirectory — prevents tools from writing app files
      } as Record<string, string>;

      const baseParams: Record<string, unknown> = {
        envVars: mergedEnvs,
        public: true,
        autoStopInterval: 15,
      };

      if (this.config.networkAllowList) {
        baseParams.networkAllowList = this.config.networkAllowList;
      }

      let sandbox: Sandbox;
      if (this.config.image) {
        params = {
          image,
          ...baseParams,
        } as any;
      } else {
        params = {
          snapshot: this.config.snapshot ?? "claude-code-env:1.0.0",
          ...baseParams,
        } as any;
      }
      sandbox = await daytona.create(params);

      return new DaytonaSandboxInstance(sandbox, daytona, sandbox.id, envs);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Cannot resolve module")
      ) {
        throw new Error(
          "Daytona SDK not found. Please install daytona-sdk: npm install daytona-sdk"
        );
      }
      throw new Error(
        `Failed to create Daytona sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async resume(sandboxId: string): Promise<SandboxInstance> {
    try {
      console.log("Resuming sandbox:", sandboxId);
      // Initialize Daytona client (keep it simple, match create())
      const daytonaConfig: DaytonaSDKConfig = {
        apiKey: this.config.apiKey,
        apiUrl: this.config.serverUrl || "https://app.daytona.io/api",
      };

      const daytona = new Daytona(daytonaConfig);

      // Get workspace by ID
      const workspace = await daytona.get(sandboxId);

      // If sandbox is not running, start it
      const state = (workspace.state || "").toString().toUpperCase();
      if (state === "STOPPED" || state === "ARCHIVED") {
        await workspace.start();
      }

      return new DaytonaSandboxInstance(
        workspace,
        daytona,
        sandboxId,
        undefined
      );
    } catch (error) {
      throw new Error(
        `Failed to resume Daytona sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  async get(sandboxId: string): Promise<SandboxInstance> {
    try {
      console.log("Getting sandbox:", sandboxId);
      // Initialize Daytona client (keep it simple, match create())
      const daytonaConfig: DaytonaSDKConfig = {
        apiKey: this.config.apiKey,
        apiUrl: this.config.serverUrl || "https://app.daytona.io/api",
      };

      const daytona = new Daytona(daytonaConfig);

      // Get workspace by ID
      const sandbox = await daytona.get(sandboxId);

      return new DaytonaSandboxInstance(
        sandbox,
        daytona,
        sandboxId,
        undefined
      );
    } catch (error) {
      throw new Error(
        `Failed to resume Daytona sandbox: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

export function createDaytonaProvider(
  config: DaytonaConfig
): DaytonaSandboxProvider {
  return new DaytonaSandboxProvider(config);
}
