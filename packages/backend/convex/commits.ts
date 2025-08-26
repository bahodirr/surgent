import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

export const saveCheckpoint = mutation({
  args: {
    projectId: v.id("projects"),
    sessionId: v.id("sessions"),
    sha: v.string(),
    message: v.string(),
    stats: v.object({
      filesChanged: v.number(),
      additions: v.number(),
      deletions: v.number(),
      files: v.optional(
        v.array(
          v.object({
            path: v.string(),
            additions: v.number(),
            deletions: v.number(),
          })
        )
      ),
    }),
    metadata: v.optional(v.any()),
    messageId: v.optional(v.id('sessionMessages')),
  },
  handler: async (ctx, { projectId, sessionId, sha, message, stats, messageId, metadata }) => {
    await ctx.db.insert("commits", {
      projectId,
      sessionId,
      sha,
      message,
      stats,
      metadata,
      messageId,
    });
  },
});

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }): Promise<Doc<"commits">[]> => {
    const items = await ctx.db
      .query("commits")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId as Id<"sessions">))
      .order("desc")
      .collect();
    return items as Doc<"commits">[];
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<Doc<"commits">[]> => {
    const items = await ctx.db
      .query("commits")
      .withIndex("by_project", (q) => q.eq("projectId", projectId as Id<"projects">))
      .order("desc")
      .collect();
    return items as Doc<"commits">[];
  },
});


