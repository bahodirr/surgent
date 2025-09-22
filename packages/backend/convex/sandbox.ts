"use node";

import { createDaytonaProvider } from "./agentic/sandbox/daytona";
import { config } from "./config";

export async function getOrCreateSandbox(args: {
  sandboxId?: string;
  port?: number;
  templatePath?: string;
  workingDirectory?: string;
}): Promise<{ sandboxId: string; previewUrl: string }> {
  const provider = createDaytonaProvider({
    apiKey: config.daytona.apiKey,
    serverUrl: config.daytona.serverUrl,
    snapshot: "default-web-env:1.0.0",
  });

  const { sandboxId, workingDirectory, port = 3000 } = args;

  const envVars: Record<string, string> = {
    ANTHROPIC_API_KEY: config.anthropic.apiKey as string,
    ANTHROPIC_BASE_URL: config.anthropic.baseUrl as string,
    OPENAI_API_KEY: config.openai.apiKey as string,
  };

  let sandbox;
  if (sandboxId) {
    try {
      sandbox = await provider.resume(sandboxId);
    } catch (error) {
      sandbox = await provider.create(envVars, undefined, workingDirectory);
    }
  } else {
    sandbox = await provider.create(envVars, undefined, workingDirectory);
  }

  const previewUrl = await sandbox.getHost(port);
  return { sandboxId: sandbox.sandboxId, previewUrl } as const;
}

// initializeSandbox merged into getOrCreateSandbox via args.init
