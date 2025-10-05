import { query, mutation, internalMutation, internalQuery } from './_generated/server';
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

// Internal-only: fetch a project by id without auth checks (for internal actions)
export const getProjectInternal = internalQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId as Id<'projects'>);
    return (project as Doc<'projects'>) ?? null;
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

    // Enforce per-user project limit: max 3 projects
    const existingProjects = await ctx.db
      .query('projects')
      .withIndex('by_user', (q) => q.eq('userId', userId as Id<'users'>))
      .take(3);
    if (existingProjects.length >= 3) {
      throw new Error('Project limit reached: maximum 3 projects per user');
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

// Public: Set the project's sandbox to run indefinitely (schedules internal action)
export const setProjectSandboxRunIndefinitely = mutation({
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

    await ctx.scheduler.runAfter(0, internal.agent.setRunIndefinitely, {
      sandboxId: project.sandboxId,
    });

    // Mark project sandbox as deployed=true
    await ctx.runMutation(internal.projects.setSandboxDeployed, {
      projectId: projectId as Id<'projects'>,
      deployed: true,
    });

    return { scheduled: true } as const;
  },
});

export const deployProject = mutation({
  args: { projectId: v.id('projects'), deployName: v.optional(v.string()) },
  handler: async (ctx, { projectId, deployName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Unauthenticated');

    const project = await ctx.db.get(projectId as Id<'projects'>);
    if (!project) throw new Error('Project not found');
    if ((project.userId as Id<'users'>) !== (userId as Id<'users'>)) {
      throw new Error('Forbidden');
    }
    if (!project.sandboxId) throw new Error('Sandbox not found');

    // Initialize deployment object with queued status and target URL
    const name = deployName ? sanitizeDeployName(deployName) : undefined;
    const targetUrl = name ? `https://${name}.surgent.dev` : undefined;
    await ctx.db.patch(projectId as Id<'projects'>, {
      deployment: {
        ...((project as any).deployment || {}),
        status: 'queued',
        name,
        previewUrl: targetUrl,
      },
    });

    await ctx.scheduler.runAfter(0, internal.agent.deployProject, {
      projectId: projectId as Id<'projects'>,
      deployName: deployName || undefined,
    });

    return { scheduled: true } as const;
  },
});

// Internal: set or update deployment state object on a project
export const setDeployment = internalMutation({
  args: {
    projectId: v.id('projects'),
    status: v.string(),
    name: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { projectId, status, name, previewUrl }) => {
    const project = await ctx.db.get(projectId as Id<'projects'>);
    if (!project) throw new Error('Project not found');

    const deployment = {
      ...((project as any).deployment || {}),
      status,
      name: name ?? (project as any).deployment?.name,
      previewUrl: previewUrl ?? (project as any).deployment?.previewUrl,
    };

    await ctx.db.patch(projectId as Id<'projects'>, { deployment });
    return null;
  },
});

function sanitizeDeployName(input: string): string {
  const lower = input.toLowerCase();
  const replaced = lower.replace(/[^a-z0-9-]+/g, '-');
  const collapsed = replaced.replace(/-+/g, '-');
  const trimmed = collapsed.replace(/^-+|-+$/g, '');
  return trimmed.slice(0, 63);
}

// Internal: set sandbox.deployed flag on project
export const setSandboxDeployed = internalMutation({
  args: { projectId: v.id('projects'), deployed: v.boolean(), deployName: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { projectId, deployed, deployName }) => {
    const project = await ctx.db.get(projectId as Id<'projects'>);
    if (!project) {
      throw new Error('Project not found');
    }

    // Update the sandbox.deployed flag
    const updatedSandbox = {
      ...(project.sandbox || {}),
      deployed,
    };

    // Optionally update the deployName in metadata
    let patch: any = { sandbox: updatedSandbox };
    if (deployName) {
      patch.metadata = {
        ...(project.metadata || {}),
        deployName,
      };
    }

    await ctx.db.patch(projectId as Id<'projects'>, patch);
    return null;
  },
});
