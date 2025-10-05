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
    snapshot: "cloudflare-web-env:1.0.5",
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

  // Ensure the sandbox runs indefinitely based on Daytona docs
  // try {
  //   // Disable auto-stop to run indefinitely
  //   // Also stretch archive interval to max and disable auto-delete as a safeguard
  //   // Note: These methods are available on the Daytona SDK Sandbox instance
  //   // and are no-ops if already configured accordingly.
  //   // We cast to any to call SDK-specific helpers.
  //   const sdkSandbox: any = (sandbox as any).sandbox ?? (sandbox as any);
  //   if (sdkSandbox?.setAutostopInterval) {
  //     await sdkSandbox.setAutostopInterval(0);
  //   }
  //   if (sdkSandbox?.setAutoArchiveInterval) {
  //     await sdkSandbox.setAutoArchiveInterval(0);
  //   }
  //   if (sdkSandbox?.setAutoDeleteInterval) {
  //     await sdkSandbox.setAutoDeleteInterval(-1);
  //   }
  // } catch {}

  const previewUrl = await sandbox.getHost(port);
  return { sandboxId: sandbox.sandboxId, previewUrl } as const;
}

// initializeSandbox merged into getOrCreateSandbox via args.init
