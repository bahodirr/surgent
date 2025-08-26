import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { normalizeAgentMessage, type NormalizedMessage } from "./agentic/agent/adapter";

export type TodoItem = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export type GetSessionResult = (Doc<"sessions"> & { timeline: any[]; todos?: TodoItem[] }) | null;

export const appendMessage = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    role: v.optional(v.string()),
    raw: v.any(),
  },
  returns: v.id("sessionMessages"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const insertedId = await ctx.db.insert("sessionMessages", {
      sessionId: args.sessionId,
      role: args.role,
      raw: args.raw,
    });

    // Handle Claude Code system/result messages
    const raw = args.raw;
    const type = raw.type;

    // On system init, set agent session id
    if (type === "system" && raw.subtype === "init" && raw.session_id) {
      await ctx.db.patch(args.sessionId, {
        agentSessionId: raw.session_id,
        agentProvider: "anthropic",
      });
    }

    // On result, append usage stats
    if (type === "result") {
      const usage = raw.usage || {};
      const stat = {
        createdAt: Date.now(),
        subtype: raw.subtype,
        costUsd: raw.total_cost_usd,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens,
        durationMs: raw.duration_ms,
        durationApiMs: raw.duration_api_ms,
        numTurns: raw.num_turns,
      };

      const currentStats = session.stats || [];
      await ctx.db.patch(args.sessionId, { stats: [...currentStats, stat] });

      // Also embed messageId into the stored raw to simplify lookups later
      await ctx.db.patch(insertedId as Id<"sessionMessages">, {
        raw: { ...raw, systemMessageId: insertedId },
      });
    }
    return insertedId as Id<"sessionMessages">;
  },
});

// Create a session (no agent run)
export const createSession = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, title, metadata }): Promise<Id<"sessions">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const project = await ctx.db.get(projectId as Id<"projects">);
    if (!project) throw new Error("Project not found");
    if ((project.userId as Id<"users">) !== (userId as Id<"users">)) {
      throw new Error("Forbidden");
    }

    const sessionId = (await ctx.db.insert("sessions", {
      projectId: projectId as Id<"projects">,
      title: title || "New session",
      metadata,
    })) as Id<"sessions">;

    return sessionId;
  },
});

// Create a new session message and schedule the agent to run for a project
export const createMessageAndRunAgent = mutation({
  args: {
    projectId: v.id("projects"),
    prompt: v.string(),
    model: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("ask"), v.literal("code"))),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, { projectId, prompt, model, mode, sessionId }): Promise<{ sessionId: Id<"sessions"> }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const project = await ctx.db.get(projectId as Id<"projects">);
    if (!project) throw new Error("Project not found");
    if ((project.userId as Id<"users">) !== (userId as Id<"users">)) {
      throw new Error("Forbidden");
    }
    if (!project.sandboxId) throw new Error("Sandbox not found");

    const existing = await ctx.db.get(sessionId as Id<"sessions">);
    if (!existing) throw new Error("Session not found");
    
    if (
      (existing.projectId as Id<"projects">) !== (projectId as Id<"projects">)
    ) {
      throw new Error("Session does not belong to project");
    }

    await ctx.runMutation(internal.sessions.appendMessage, {
      sessionId: sessionId as Id<"sessions">,
      role: "user",
      raw: prompt,
    });

    await ctx.scheduler.runAfter(0, internal.actions.agent.runAgent, {
      sandboxId: project.sandboxId,
      projectId: projectId as Id<"projects">,
      prompt,
      convexSessionId: sessionId as Id<"sessions">,
      model,
      mode,
    });

    return { sessionId: sessionId } as const;
  },
});

// Get a single session by id (authorized to project owner)
export const getSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }): Promise<GetSessionResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const session = await ctx.db.get(sessionId as Id<"sessions">);
    if (!session) return null;

    const project = await ctx.db.get(session.projectId as Id<"projects">);
    if (!project) return null;
    if ((project.userId as Id<"users">) !== (userId as Id<"users">))
      return null;

    // Load commits for this session
    const commits = await ctx.db
      .query("commits")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .collect();
      
    const commitByMessageId: Record<string, Doc<"commits">> = {};
    commits.forEach(commit => {
      if (commit.messageId) {
        commitByMessageId[commit.messageId] = commit;
      }
    });

    // Load and normalize messages (last 100)
    const messages = await ctx.db
      .query("sessionMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(100);
    
    // Reverse to get chronological order
    messages.reverse();

    let normalized: NormalizedMessage[] = messages.flatMap((m) => {
      const raw = m.raw;
      if (typeof raw === "string") {
        return [{ role: "user", type: "message", contentText: raw, raw }];
      }
      return normalizeAgentMessage("claude", raw);
    });

    // Merge tool_result into tool_use messages (two-pass for reliability)
    const toolUseById: Record<string, NormalizedMessage> = {};
    const toRemove = new Set<number>();
    
    normalized.forEach((nm, i) => {
      if (nm.type === "tool" && nm.tool?.id) {
        toolUseById[nm.tool.id] = nm;
      } else if (nm.type === "tool_result" && nm.tool?.id) {
        const toolUse = toolUseById[nm.tool.id];
        if (toolUse?.tool) {
          toolUse.tool.result = nm.tool.result;
          toolUse.tool.status = nm.tool.status;
          toRemove.add(i);
        }
      }
    });
    
    normalized = normalized.filter((_, i) => !toRemove.has(i));

    // Build grouped timeline: message → toolGroup → message ...
    const timeline: any[] = [];
    for (let i = 0; i < normalized.length; ) {
      const nm = normalized[i];
      // System events: init and result/error with stats
      if (nm.role === "system" && (nm.type === "init")) {
        timeline.push({ kind: "systemInit", msg: nm });
        i++;
        continue;
      }

      // Group consecutive tool messages
      if (nm.type === "tool" || nm.type === "tool_result") {
        const items: NormalizedMessage[] = [];
        while (i < normalized.length) {
          const cur = normalized[i];
          if (cur.type === "tool" || cur.type === "tool_result") {
            items.push(cur);
            i++;
          } else {
            break;
          }
        }
        if (items.length > 0) timeline.push({ kind: "toolGroup", items });
        continue;
      }

      if (nm.role === "system" && (nm.type === "result" || nm.type === "error")) {
        const msgId = nm.raw.systemMessageId;
        const checkpoint = msgId ? commitByMessageId[msgId] : undefined;
        timeline.push({ kind: "systemResult", msg: nm, checkpoint });
        i++;
        continue;
      }
      
      timeline.push({ kind: "message", msg: nm });
      i++;
    }

    // Find latest TodoWrite todos
    const latestTodos = normalized
      .slice(-5)
      .reverse()
      .find(nm => nm.role === "assistant" && nm.tool?.name === "TodoWrite")
      ?.tool?.input?.todos?.map((t: any) => ({ id: t.id, content: t.content, status: t.status })) || [];
    
    return { ...session, timeline, todos: latestTodos } as any;
    // messages: normalized, 
  },
});

// List all sessions for a project (authorized to project owner)
export const listSessionsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<Doc<"sessions">[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const project = await ctx.db.get(projectId as Id<"projects">);
    if (!project) return [];
    if ((project.userId as Id<"users">) !== (userId as Id<"users">)) return [];

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_project", (q) =>
        q.eq("projectId", projectId as Id<"projects">)
      )
      .order("desc")
      .collect();

    return sessions;
  },
});
