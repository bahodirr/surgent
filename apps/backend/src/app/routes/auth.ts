import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { auth } from '../../lib/auth';

export default async function (fastify: FastifyInstance) {
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request: FastifyRequest, reply: FastifyReply) {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);

        // Use global fetch API objects with any typing to avoid TS DOM lib requirement
        const headers = new Headers();
        Object.entries(request.headers).forEach(([key, value]) => {
          if (value) headers.append(key, value.toString());
        });

        const req = new Request(url.toString(), {
          method: request.method as string,
          headers,
          body: request.body ? JSON.stringify(request.body) : undefined,
        });

        const response = await auth.handler(req);

        reply.status(response.status);
        response.headers.forEach((value: string, key: string) => reply.header(key, value));
        reply.send(response.body ? await response.text() : null);
      } catch (error: any) {
        fastify.log.error('Authentication Error:', error);
        reply.status(500).send({
          error: 'Internal authentication error',
          code: 'AUTH_FAILURE',
        });
      }
    },
  });
}