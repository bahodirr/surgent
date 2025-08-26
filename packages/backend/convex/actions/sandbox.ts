"use node";

import { createDaytonaProvider } from "../agentic/sandbox/daytona";

export async function getOrCreateSandbox(args: {
  sandboxId?: string;
  port?: number;
  templatePath?: string;
  workingDirectory?: string;
}): Promise<{ sandboxId: string; previewUrl: string }> {
  const provider = createDaytonaProvider({
    apiKey: process.env.DAYTONA_API_KEY,
    // serverUrl: process.env.DAYTONA_SERVER_URL,
    snapshot: "claude-code-vite-react-shadcn-ts-env:1.0.0",
  });

  const port = args.port ?? 3000;
  const envVars: Record<string, string> = {};
  if (process.env.ANTHROPIC_API_KEY)
    envVars["ANTHROPIC_API_KEY"] = process.env.ANTHROPIC_API_KEY;

  let sandbox;
  if (args.sandboxId) {
    try {
      console.log("Resuming sandbox in getorcreate", args.sandboxId);
      sandbox = await provider.resume(args.sandboxId);
    } catch {
      console.log("Error resuming sandbox", args.sandboxId);
    }
  }
  if (!sandbox) {
    console.log("Sandbox has been created");
    sandbox = await provider.create(envVars, undefined, args.workingDirectory);
  }

  const previewUrl = await sandbox.getHost(port);

  return { sandboxId: sandbox.sandboxId, previewUrl } as const;
}

// initializeSandbox merged into getOrCreateSandbox via args.init
