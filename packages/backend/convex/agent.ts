"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { ClaudeAgent } from "./agentic/agent/claude";
import { BaseAgent } from "./agentic/agent/base";
import { createDaytonaProvider } from "./agentic/sandbox/daytona";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { getOrCreateSandbox } from "./sandbox";
import { config } from "./config";

// Initialize a project sandbox and persist fields on the project
export const initializeProject = internalAction({
  args: { projectId: v.id("projects") },
  returns: v.object({ sandboxId: v.string(), previewUrl: v.string() }),
  handler: async (ctx, args) => {
    // Load project via public query
    const project: any = await ctx.runQuery(api.projects.getProject, {
      projectId: args.projectId,
    });

    const base = await getOrCreateSandbox({
      sandboxId: project?.sandboxId,
      port: 3000,
      templatePath: "/workspace/template",
      workingDirectory: "/tmp/project",
    });

    await ctx.runMutation(internal.projects.setSandboxState, {
      projectId: args.projectId,
      sandboxId: base.sandboxId,
      previewUrl: base.previewUrl,
      isInitialized: true,
    });

    return { sandboxId: base.sandboxId, previewUrl: base.previewUrl };
  },
});

// Initialize a project sandbox and persist fields on the project
export const resumeProject = internalAction({
  args: { projectId: v.id("projects"), sandboxId: v.string() },
  returns: v.object({ sandboxId: v.string(), previewUrl: v.string() }),
  handler: async (ctx, args) => {
    const base = await getOrCreateSandbox({
      sandboxId: args.sandboxId,
      port: 3000,
      templatePath: "/workspace/template",
      workingDirectory: "/tmp/project",
    });

    return { sandboxId: base.sandboxId, previewUrl: base.previewUrl };
  },
});

export const runAgent = internalAction({
  args: {
    sandboxId: v.string(),
    projectId: v.id("projects"),
    prompt: v.string(),
    sessionId: v.optional(v.string()),
    convexSessionId: v.optional(v.id("sessions")),
    model: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("ask"), v.literal("code"))),
    
  },
  returns: v.object({
    exitCode: v.number(),
    stdout: v.string(),
    stderr: v.string(),
    sandboxId: v.string(),
    sessionId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const provider = createDaytonaProvider({
      apiKey: config.daytona.apiKey,
      snapshot: "default-web-env:1.0.0",
    });

    console.log("agent is starting", args.sandboxId);

    const agent: BaseAgent = new ClaudeAgent({
      provider: "anthropic",
      providerApiKey: config.anthropic.apiKey,
      providerBaseUrl: config.anthropic.baseUrl,
      model: args.model || "glm-4.5",
      sandboxProvider: provider,
      sandboxId: args.sandboxId,
      workingDirectory: "/tmp/project",
    });

    console.log("agent is created now",config.anthropic.baseUrl,config.anthropic.apiKey);
    

    if (args.sessionId) {
      try {
        await agent.setSession(args.sessionId);
      } catch {}
    }
    console.log("agent is running");

    let finalSessionMessageId: Id<"sessionMessages"> | undefined;

    const handleUpdate = async (message: string) => {
      try {
        const parsed = JSON.parse(message);
        console.log("parsed", parsed);
        if (parsed.type === "start" && parsed.sandbox_id) return;
        const insertedId = await ctx.runMutation(internal.sessions.appendMessage, {
          sessionId: args.convexSessionId!,
          raw: parsed,
        });
        if (parsed?.type === "result") {
          finalSessionMessageId = insertedId as Id<"sessionMessages">;
        }
      } catch {}
    };

    const result = await agent.generateCode(
      args.prompt,
      args.mode || "code",
      undefined,
      { onUpdate: handleUpdate },
      true
    );

    const checkpoint = await agent.createLocalCheckpoint(
      `Checkpoint after run: ${args.mode || "code"}`
    );
    if (checkpoint) {
      // Persist metadata in Convex commits table (requires session id)
      if (args.convexSessionId) {
        await ctx.runMutation(api.commits.saveCheckpoint, {
          projectId: args.projectId,
          sessionId: args.convexSessionId,
          sha: checkpoint.sha,
          message: checkpoint.message,
          stats: checkpoint.stats,
          messageId: finalSessionMessageId,
        });
      }
    }

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      sandboxId: result.sandboxId,
    } as const;
  },
});
