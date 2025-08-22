import { FastifyInstance } from 'fastify';
import { projectService } from '../../services/project';
import { sandboxService } from '../../services/sandbox';

interface CreateProjectBody {
  name: string;
  github?: {
    repo?: string;
    branch?: string;
  };
  settings?: Record<string, any>;
}

interface UpdateProjectBody {
  name?: string;
  github?: any;
  settings?: any;
  metadata?: any;
}

export default async function (fastify: FastifyInstance) {
  // Get all projects
  fastify.get(
    '/api/projects',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const projects = await projectService.listProjects(request.user!.id);
        return reply.send({ projects });
      } catch (error) {
        fastify.log.error(`Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return reply.code(500).send({
          error: 'Failed to list projects',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Create new project
  fastify.post<{ Body: CreateProjectBody }>(
    '/api/projects',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const project = await projectService.createProject(
          request.body,
          request.user!.id
        );
        return reply.send({ project });
      } catch (error) {
        fastify.log.error(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return reply.code(500).send({
          error: 'Failed to create project',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get project details
  fastify.get<{ Params: { id: string } }>(
    '/api/projects/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const project = await projectService.getProject(
          request.params.id,
          request.user!.id
        );
        
        if (!project) {
          return reply.code(404).send({ error: 'Project not found' });
        }
        
        return reply.send({ project });
      } catch (error) {
        fastify.log.error(`Failed to get project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return reply.code(500).send({
          error: 'Failed to get project',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Update project
  fastify.put<{ Params: { id: string }; Body: UpdateProjectBody }>(
    '/api/projects/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const project = await projectService.updateProject(
          request.params.id,
          request.body,
          request.user!.id
        );
        return reply.send({ project });
      } catch (error) {
        fastify.log.error(`Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return reply.code(500).send({
          error: 'Failed to update project',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Delete project
  fastify.delete<{ Params: { id: string } }>(
    '/api/projects/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        await projectService.deleteProject(
          request.params.id,
          request.user!.id
        );
        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return reply.code(500).send({
          error: 'Failed to delete project',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get project statistics
  fastify.get<{ Params: { id: string } }>(
    '/api/projects/:id/stats',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const stats = await projectService.getProjectStats(
          request.params.id,
          request.user!.id
        );
        return reply.send({ stats });
      } catch (error) {
        fastify.log.error(`Failed to get project stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return reply.code(500).send({
          error: 'Failed to get project stats',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Initialize project sandbox
  fastify.post<{ Params: { id: string }; Body: { template?: string } }>(
    '/api/projects/:id/initialize',
    { preHandler: fastify.authenticate },
    async (request, reply) => {

      const user = request.user!;
      const projectId = request.params.id;
      const { template = 'vite-react-ts' } = request.body || {};

      fastify.log.info(`Initializing project sandbox userId=${user.id} projectId=${projectId} template=${template}`);

      try {
      //   // Verify project exists and belongs to user
        const project = await projectService.getProject(projectId, user.id);
        console.log('Project information', project);
        
        if (!project) {
          return reply.code(404).send({ 
            success: false,
            error: 'Project not found' 
          });
        }

        // If already initialized, verify sandbox is STARTED and dev server is healthy
        if (project.sandbox_id && project.sandbox_metadata?.isInitialized) {
          await sandboxService.getOrCreateSandbox(projectId, user.id, {
            snapshotName: 'claude-code-env:1.0.0',
            port: 3000,
          });

          return reply.send({
            success: true,
            message: 'Project already initialized',
            sandboxId: project.sandbox_id,
            previewUrl: project.sandbox_metadata?.preview_url,
            alreadyInitialized: true,
          });
        }

        // Create or recover sandbox
        const sandbox = await sandboxService.getOrCreateSandbox(projectId, user.id, {
          snapshotName: 'claude-code-env:1.0.0',
          port: 3000,
        });

        // Setup claude user and project template
        // await sandbox.commands.run('id claude || useradd -m -s /bin/bash claude');
        await sandbox.commands.run('cp -r /workspace/template /tmp/project');
        // await sandbox.commands.run('chown -R claude:claude /tmp/project');

        // Start dev server via PM2 and save
        await sandbox.commands.run('cd /tmp/project && pm2 start ecosystem.config.cjs');
        await sandbox.commands.run('pm2 save');
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Get preview URL and persist
        const previewUrl = await sandbox.getHost(3000);
        await sandboxService.set(projectId, user.id, {
          sandboxId: sandbox.sandboxId,
          metadata: {
            preview_url: previewUrl,
            status: 'started',
            isInitialized: true,
            template,
          },
        });

        return reply.send({
          success: true,
          message: `Project initialized successfully with ${template} template`,
          sandboxId: project.sandbox_id,
          previewUrl: previewUrl,
        });

      } catch (error) {
        fastify.log.error(`Failed to initialize project: ${error instanceof Error ? error.message : 'Unknown error'}`);

        return reply.code(500).send({
          success: false,
          error: "Failed to initialize project",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

} 