import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

// Convex schema for the `notes` table based on the provided SQL schema.
// Notes:
// - Convex automatically adds `_id` and `_creationTime` system fields.
// - `id` (UUID in SQL) maps to Convex's `_id` and is not explicitly declared here.
// - Optional/nullable SQL columns are represented with `v.optional(...)`.

const notesSchema = {

  // Users table (kept)
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Custom fields
    subscriptionStatus: v.optional(v.string()),
    subscription: v.optional(v.any()),
    usage: v.optional(v.any()),
    metadata: v.optional(v.any()),
  }).index('email', ['email']),

  // Projects table
  projects: defineTable({
    userId: v.id('users'),
    name: v.string(),
    github: v.optional(v.any()),
    settings: v.optional(v.any()),
    sandboxId: v.optional(v.string()),
    sandbox: v.optional(v.any()),
    metadata: v.optional(v.any()),
  }).index('by_user', ['userId']),

  // Sessions table for Claude/Projects to avoid conflict with auth sessions
  sessions: defineTable({
    projectId: v.id('projects'),
    agentSessionId: v.optional(v.string()),
    agentProvider: v.optional(v.string()),
    title: v.optional(v.string()),
    metadata: v.optional(v.any()),
    stats: v.optional(v.any()),
  }).index('by_project', ['projectId']).index('by_agentSessionId', ['agentSessionId']),

  // Session messages table to avoid contention on the sessions document
  sessionMessages: defineTable({
    sessionId: v.id('sessions'),
    role: v.optional(v.string()),
    raw: v.any(),
  }).index('by_session', ['sessionId']),

  // Commits table
  commits: defineTable({
    sha: v.string(),
    sessionId: v.id('sessions'),
    projectId: v.id('projects'),
    message: v.optional(v.string()),
    version: v.optional(v.number()),
    stats: v.optional(v.any()),
    messageId: v.optional(v.id('sessionMessages')),
    metadata: v.optional(v.any()),
  })
    .index('by_session', ['sessionId'])
    .index('by_project', ['projectId'])
    .index('by_messageId', ['messageId']),
};

export default defineSchema({
  ...authTables,
  ...notesSchema,
});
