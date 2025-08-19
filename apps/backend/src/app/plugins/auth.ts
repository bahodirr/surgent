import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { auth } from '../../lib/auth';

interface SessionUser {
  id: string;
  email?: string;
  name?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }

  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

function headersFromRaw(rawHeaders: Record<string, any>) {
  const h = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value) h.append(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return h;
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  // Register fastify-cookie so request.cookies is available (safe if already registered)
  await fastify.register(import('@fastify/cookie'));

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const headers = headersFromRaw(request.headers as Record<string, any>);
      const session = await auth.api.getSession({ headers });

      if (!session || !session.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      request.user = session.user as SessionUser;
    } catch (err) {
      fastify.log.error('Auth check failed', err);
      return reply.code(500).send({ error: 'Failed to verify session' });
    }
  });
}); 