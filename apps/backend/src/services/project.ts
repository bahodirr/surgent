import { db } from '../kysely_db';
import { sql } from 'kysely';

export interface Project {
  id: string;
  profile_id: string;
  name: string;
  github?: any;
  settings?: any;
  sandbox_id?: string;
  sandbox_metadata?: any;
  metadata?: any;
  created_at: Date;
}

export interface CreateProjectInput {
  name: string;
  github?: {
    repo?: string;
    branch?: string;
  };
  settings?: Record<string, any>;
}

export interface UpdateProjectInput {
  name?: string;
  github?: any;
  settings?: any;
  metadata?: any;
}

export class ProjectService {
  async getUserProfile(userId: string) {
    let profile = await db.selectFrom('profiles')
      .where('user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();

    if (!profile) {
      // Create profile if it doesn't exist
      const result = await db.insertInto('profiles')
        .values({
          id: `profile_${userId}`,
          user_id: userId,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      
      profile = result;
    }

    return profile;
  }

  async listProjects(userId: string) {
    const profile = await this.getUserProfile(userId);
    
    const projects = await db.selectFrom('projects')
      .where('profile_id', '=', profile.id)
      .orderBy('created_at', 'desc')
      .selectAll()
      .execute();

    return projects;
  }

  async getProject(projectId: string, userId: string) {
    const profile = await this.getUserProfile(userId);
    
    const project = await db.selectFrom('projects')
      .where('id', '=', projectId)
      .where('profile_id', '=', profile.id)
      .selectAll()
      .executeTakeFirst();

    return project;
  }

  async createProject(input: CreateProjectInput, userId: string) {
    const profile = await this.getUserProfile(userId);
    
    const project = await db.insertInto('projects')
      .values({
        profile_id: profile.id,
        name: input.name,
        github: input.github as any,
        settings: input.settings as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return project;
  }

  async updateProject(projectId: string, input: UpdateProjectInput, userId: string) {
    const profile = await this.getUserProfile(userId);
    
    // Verify ownership
    const existing = await this.getProject(projectId, userId);
    if (!existing) {
      throw new Error('Project not found');
    }

    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.github !== undefined) updateData.github = JSON.stringify(input.github);
    if (input.settings !== undefined) updateData.settings = JSON.stringify(input.settings);
    if (input.metadata !== undefined) updateData.metadata = JSON.stringify(input.metadata);

    const project = await db.updateTable('projects')
      .set(updateData)
      .where('id', '=', projectId)
      .where('profile_id', '=', profile.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return project;
  }

  async deleteProject(projectId: string, userId: string) {
    const profile = await this.getUserProfile(userId);
    
    // Verify ownership
    const existing = await this.getProject(projectId, userId);
    if (!existing) {
      throw new Error('Project not found');
    }

    await db.deleteFrom('projects')
      .where('id', '=', projectId)
      .where('profile_id', '=', profile.id)
      .execute();

    return { success: true };
  }

  async getProjectStats(projectId: string, userId: string) {
    // Verify ownership
    const project = await this.getProject(projectId, userId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Get session count
    const sessionCount = await db.selectFrom('sessions')
      .where('project_id', '=', projectId)
      .select(sql<number>`count(*)`.as('count'))
      .executeTakeFirstOrThrow();

    // Get commit count
    const commitCount = await db.selectFrom('commits')
      .where('project_id', '=', projectId)
      .select(sql<number>`count(*)`.as('count'))
      .executeTakeFirstOrThrow();

    // Get last activity
    const lastSession = await db.selectFrom('sessions')
      .where('project_id', '=', projectId)
      .orderBy('updated_at', 'desc')
      .select(['updated_at'])
      .executeTakeFirst();

    return {
      sessionCount: Number(sessionCount.count),
      commitCount: Number(commitCount.count),
      lastActivity: lastSession?.updated_at || project.created_at
    };
  }
}

export const projectService = new ProjectService();