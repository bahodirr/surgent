import { db } from '../kysely_db';
import { sql } from 'kysely';
import { projectService } from './project';

export interface Session {
  id: string;
  project_id: string;
  title?: string;
  metadata?: any;
  messages: any;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: number;
  metadata?: any;
}

export interface CreateSessionInput {
  projectId: string;
  title?: string;
  metadata?: Record<string, any>;
}

export interface AddMessageInput {
  content: string;
  sender: 'user' | 'assistant';
  metadata?: Record<string, any>;
}

export class SessionService {
  async listSessions(projectId: string, userId: string) {
    // Verify project ownership
    const project = await projectService.getProject(projectId, userId);
    if (!project) {
      throw new Error('Project not found');
    }

    const sessions = await db.selectFrom('sessions')
      .where('project_id', '=', projectId)
      .orderBy('updated_at', 'desc')
      .selectAll()
      .execute();

    // Parse messages JSON
    return sessions.map(session => ({
      ...session,
      messages: JSON.parse(session.messages as string)
    }));
  }

  async getSession(sessionId: string, userId: string) {
    const session = await db.selectFrom('sessions')
      .innerJoin('projects', 'projects.id', 'sessions.project_id')
      .innerJoin('profiles', 'profiles.id', 'projects.profile_id')
      .where('sessions.id', '=', sessionId)
      .where('profiles.user_id', '=', userId)
      .select([
        'sessions.id',
        'sessions.project_id',
        'sessions.title',
        'sessions.metadata',
        'sessions.messages',
        'sessions.created_at',
        'sessions.updated_at'
      ])
      .executeTakeFirst();

    if (!session) {
      return null;
    }

    return {
      ...session,
      messages: JSON.parse(session.messages as string)
    };
  }

  async createSession(input: CreateSessionInput, userId: string) {
    // Verify project ownership
    const project = await projectService.getProject(input.projectId, userId);
    if (!project) {
      throw new Error('Project not found');
    }

    const session = await db.insertInto('sessions')
      .values({
        project_id: input.projectId,
        title: input.title,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
        messages: JSON.stringify([]),
        created_at: new Date(),
        updated_at: new Date()
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...session,
      messages: []
    };
  }

  async updateSessionTitle(sessionId: string, title: string, userId: string) {
    // Verify ownership
    const existing = await this.getSession(sessionId, userId);
    if (!existing) {
      throw new Error('Session not found');
    }

    const session = await db.updateTable('sessions')
      .set({
        title,
        updated_at: new Date()
      })
      .where('id', '=', sessionId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...session,
      messages: JSON.parse(session.messages as string)
    };
  }

  async addMessage(sessionId: string, input: AddMessageInput, userId: string) {
    // Verify ownership
    const existing = await this.getSession(sessionId, userId);
    if (!existing) {
      throw new Error('Session not found');
    }

    const messages = existing.messages || [];
    const newMessage: Message = {
      id: Date.now().toString(),
      content: input.content,
      sender: input.sender,
      timestamp: Date.now(),
      metadata: input.metadata
    };

    messages.push(newMessage);

    await db.updateTable('sessions')
      .set({
        messages: JSON.stringify(messages),
        updated_at: new Date()
      })
      .where('id', '=', sessionId)
      .execute();

    return newMessage;
  }

  async deleteSession(sessionId: string, userId: string) {
    // Verify ownership
    const existing = await this.getSession(sessionId, userId);
    if (!existing) {
      throw new Error('Session not found');
    }

    await db.deleteFrom('sessions')
      .where('id', '=', sessionId)
      .execute();

    return { success: true };
  }

  async getActiveSession(projectId: string, userId: string) {
    // Verify project ownership
    const project = await projectService.getProject(projectId, userId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Get the most recent session
    const session = await db.selectFrom('sessions')
      .where('project_id', '=', projectId)
      .orderBy('updated_at', 'desc')
      .selectAll()
      .executeTakeFirst();

    if (!session) {
      // Create a new session if none exists
      return this.createSession({ projectId }, userId);
    }

    return {
      ...session,
      messages: JSON.parse(session.messages as string)
    };
  }

  async clearSessionMessages(sessionId: string, userId: string) {
    // Verify ownership
    const existing = await this.getSession(sessionId, userId);
    if (!existing) {
      throw new Error('Session not found');
    }

    await db.updateTable('sessions')
      .set({
        messages: JSON.stringify([]),
        updated_at: new Date()
      })
      .where('id', '=', sessionId)
      .execute();

    return { success: true };
  }

  async getSessionStats(sessionId: string, userId: string) {
    // Verify ownership
    const session = await this.getSession(sessionId, userId);
    if (!session) {
      throw new Error('Session not found');
    }

    const messages = session.messages || [];
    const userMessages = messages.filter((m: Message) => m.sender === 'user').length;
    const assistantMessages = messages.filter((m: Message) => m.sender === 'assistant').length;

    // Get commit count for this session
    const commitCount = await db.selectFrom('commits')
      .where('session_id', '=', sessionId)
      .select(sql<number>`count(*)`.as('count'))
      .executeTakeFirstOrThrow();

    return {
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      commitCount: Number(commitCount.count),
      duration: session.updated_at.getTime() - session.created_at.getTime()
    };
  }
}

export const sessionService = new SessionService();