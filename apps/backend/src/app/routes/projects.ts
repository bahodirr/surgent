import { FastifyInstance } from 'fastify';
import { projectService } from '../../services/project';

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
        fastify.log.error('Failed to list projects', error);
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
        fastify.log.error('Failed to create project', error);
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
        fastify.log.error('Failed to get project', error);
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
        fastify.log.error('Failed to update project', error);
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
        fastify.log.error('Failed to delete project', error);
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
        fastify.log.error('Failed to get project stats', error);
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

      fastify.log.info('Initializing project sandbox', { 
        userId: user.id, 
        projectId, 
        template 
      });

      try {
        // Verify project exists and belongs to user
        const project = await projectService.getProject(projectId, user.id);

        if (!project) {
          return reply.code(404).send({ 
            success: false,
            error: 'Project not found' 
          });
        }

        // Check if already initialized
        if (project.sandbox_id) {
          const sandboxMetadata = project.sandbox_metadata as any;
          return reply.send({
            success: true,
            message: "Project already initialized",
            sandboxId: project.sandbox_id,
            devServerUrl: sandboxMetadata?.preview_url || null,
            alreadyInitialized: true
          });
        }

        // TODO: Integrate with Daytona SDK
        // For now, simulate the initialization process
        
        // Simulate sandbox creation
        const mockSandboxId = `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const mockDevServerUrl = `https://${mockSandboxId}.preview.daytona.dev`;
        
        fastify.log.info('Creating sandbox...', { sandboxId: mockSandboxId });
        
        // Simulate async operations
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update project with sandbox information
        await projectService.updateProject(
          projectId,
          {
            metadata: {
              sandbox_id: mockSandboxId,
              sandbox_metadata: {
                preview_url: mockDevServerUrl,
                template,
                status: 'running',
                created_at: new Date().toISOString()
              }
            }
          },
          user.id
        );

        fastify.log.info('Project initialized successfully', { 
          projectId, 
          sandboxId: mockSandboxId,
          devServerUrl: mockDevServerUrl
        });

        return reply.send({
          success: true,
          message: `Project initialized successfully with ${template} template`,
          sandboxId: mockSandboxId,
          devServerUrl: mockDevServerUrl
        });

      } catch (error) {
        fastify.log.error('Failed to initialize project', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          projectId,
          userId: user.id
        });

        return reply.code(500).send({
          success: false,
          error: "Failed to initialize project",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

} 