import { FastifyInstance } from 'fastify';
import { sessionService } from '../../services/session';

interface CreateSessionBody {
  projectId: string;
  title?: string;
  metadata?: Record<string, any>;
}

interface UpdateSessionBody {
  title?: string;
}

interface AddMessageBody {
  content: string;
  sender: 'user' | 'assistant';
  metadata?: Record<string, any>;
}

export default async function (fastify: FastifyInstance) {
  // Get all sessions for a project
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/sessions',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const sessions = await sessionService.listSessions(
          request.params.projectId,
          request.user!.id
        );
        return reply.send({ sessions });
      } catch (error) {
        fastify.log.error('Failed to list sessions', error);
        return reply.code(500).send({
          error: 'Failed to list sessions',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Create new session
  fastify.post<{ Body: CreateSessionBody }>(
    '/api/sessions',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const session = await sessionService.createSession(
          request.body,
          request.user!.id
        );
        return reply.send({ session });
      } catch (error) {
        fastify.log.error('Failed to create session', error);
        return reply.code(500).send({
          error: 'Failed to create session',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get session details
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const session = await sessionService.getSession(
          request.params.id,
          request.user!.id
        );
        
        if (!session) {
          return reply.code(404).send({ error: 'Session not found' });
        }
        
        return reply.send({ session });
      } catch (error) {
        fastify.log.error('Failed to get session', error);
        return reply.code(500).send({
          error: 'Failed to get session',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Update session title
  fastify.patch<{ Params: { id: string }; Body: UpdateSessionBody }>(
    '/api/sessions/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const session = await sessionService.updateSessionTitle(
          request.params.id,
          request.body.title!,
          request.user!.id
        );
        return reply.send({ session });
      } catch (error) {
        fastify.log.error('Failed to update session', error);
        return reply.code(500).send({
          error: 'Failed to update session',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Add message to session
  fastify.post<{ Params: { id: string }; Body: AddMessageBody }>(
    '/api/sessions/:id/messages',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const message = await sessionService.addMessage(
          request.params.id,
          request.body,
          request.user!.id
        );
        return reply.send({ message });
      } catch (error) {
        fastify.log.error('Failed to add message', error);
        return reply.code(500).send({
          error: 'Failed to add message',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Delete session
  fastify.delete<{ Params: { id: string } }>(
    '/api/sessions/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        await sessionService.deleteSession(
          request.params.id,
          request.user!.id
        );
        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Failed to delete session', error);
        return reply.code(500).send({
          error: 'Failed to delete session',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get or create active session for a project
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/sessions/active',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const session = await sessionService.getActiveSession(
          request.params.projectId,
          request.user!.id
        );
        return reply.send({ session });
      } catch (error) {
        fastify.log.error('Failed to get active session', error);
        return reply.code(500).send({
          error: 'Failed to get active session',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Clear session messages
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/clear',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        await sessionService.clearSessionMessages(
          request.params.id,
          request.user!.id
        );
        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Failed to clear session', error);
        return reply.code(500).send({
          error: 'Failed to clear session',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get session statistics
  fastify.get<{ Params: { id: string } }>(
    '/api/sessions/:id/stats',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const stats = await sessionService.getSessionStats(
          request.params.id,
          request.user!.id
        );
        return reply.send({ stats });
      } catch (error) {
        fastify.log.error('Failed to get session stats', error);
        return reply.code(500).send({
          error: 'Failed to get session stats',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );
}