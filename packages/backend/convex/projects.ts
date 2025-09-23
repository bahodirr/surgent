import { query, mutation, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';

// List all projects for the authenticated user
export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>))
      .order('desc')
      .collect();

    return projects as Array<Doc<'projects'>>;
  },
});

// Get a single project by id if it belongs to the authenticated user
export const getProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const project = await ctx.db.get(projectId as Id<'projects'>);
    if (!project) return null;
    if ((project.userId as Id<'users'>) !== (userId as Id<'users'>)) return null;

    return project as Doc<'projects'>;
  },
});

// Create a new project owned by the authenticated user
export const createProject = mutation({
  args: {
    name: v.string(),
    github: v.optional(v.any()),
    settings: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { name, github, settings, metadata }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Unauthenticated');
    }

    const projectId = await ctx.db.insert('projects', {
      userId: userId as Id<'users'>,
      name,
      github,
      settings,
      metadata,
      sandbox: {
        status: 'pending',
        isInitialized: false,
      },
    });

    // Create a default session for this new project so the UI always has one
    await ctx.db.insert('sessions', {
      projectId: projectId as Id<'projects'>,
      title: 'New session',
    });

    // Initialize sandbox asynchronously
    await ctx.scheduler.runAfter(0, internal.agent.initializeProject, {
      projectId: projectId as Id<'projects'>,
    });

    return projectId as Id<'projects'>;
  },
});

// Basic project statistics for the authenticated owner
export const getProjectStats = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const project = await ctx.db.get(projectId as Id<'projects'>);
    if (!project) return null;
    if ((project.userId as Id<'users'>) !== (userId as Id<'users'>)) return null;

    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_project', (q) => q.eq('projectId', projectId as Id<'projects'>))
      .collect();

    const commits = await ctx.db
      .query('commits')
      .withIndex('by_project', (q) => q.eq('projectId', projectId as Id<'projects'>))
      .collect();

    return {
      sessionCount: sessions.length,
      commitCount: commits.length,
    } as const;
  },
});


// Internal: update sandbox fields for a project
export const setSandboxState = internalMutation({
  args: {
    projectId: v.id('projects'),
    sandboxId: v.string(),
    previewUrl: v.string(),
    isInitialized: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId as Id<'projects'>);
    if (!project) throw new Error('Project not found');

    const sandbox = {
      ...(project.sandbox as any || {}),
      status: 'started',
      isInitialized: args.isInitialized,
    } as any;

    await ctx.db.patch(args.projectId as Id<'projects'>, {
      sandboxId: args.sandboxId,
      sandbox,
    });
    return null;
  },
});

// Wake/resume a project's sandbox (schedules background action)
export const wakeSandbox = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Unauthenticated');

    const project = await ctx.db.get(projectId as Id<'projects'>);

    if (!project) throw new Error('Project not found');

    if ((project.userId as Id<'users'>) !== (userId as Id<'users'>)) {
      throw new Error('Forbidden');
    }

    if (!project.sandboxId) throw new Error('Sandbox not found');

    await ctx.scheduler.runAfter(0, internal.agent.resumeProject, {
      projectId: projectId as Id<'projects'>,
      sandboxId: project.sandboxId,
    });

    return { scheduled: true } as const;
  },
});

// Activate a project: verify ownership, schedule wake, and return project info
export const activateProject = mutation({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Unauthenticated');

    const project = await ctx.db.get(projectId as Id<'projects'>);
    if (!project) throw new Error('Project not found');
    if ((project.userId as Id<'users'>) !== (userId as Id<'users'>)) {
      throw new Error('Forbidden');
    }

    if (!project.sandboxId) throw new Error('Sandbox not found');

    await ctx.scheduler.runAfter(0, internal.agent.resumeProject, {
      projectId: projectId as Id<'projects'>,
      sandboxId: project.sandboxId,
    });

    return project as Doc<'projects'>;
  },
});

