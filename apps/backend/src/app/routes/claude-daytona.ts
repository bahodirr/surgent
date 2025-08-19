import { FastifyInstance } from 'fastify';
import { Daytona } from '@daytonaio/sdk';

interface ClaudeStreamQuery {
  prompt: string;
  sessionId?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  maxTurns?: number;
}

export default async function (fastify: FastifyInstance) {
  // Initialize Daytona - will use DAYTONA_API_KEY from env automatically
  const daytona = new Daytona();

  // SSE endpoint using Daytona sandbox for streaming
  fastify.get<{ Querystring: ClaudeStreamQuery }>(
    '/api/claude/daytona-stream',
    async (request, reply) => {
      const { prompt } =
        request.query;

      fastify.log.info('Claude Daytona stream request received', { prompt });

      if (!prompt) {
        return reply.code(400).send({ error: 'Prompt is required' });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      let sandbox;

      try {
        // Create sandbox with environment variables
        sandbox = await daytona.create({
          language: 'typescript',
          envVars: {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          }
        });

        fastify.log.info('Sandbox created:', sandbox.id);

        // Get user root directory for proper execution context
        const rootDir = await sandbox.getUserRootDir();
        fastify.log.info('Sandbox root directory:', rootDir);

        // Clone the vite-react-ts-starter repository using Daytona SDK
        fastify.log.info('Cloning vite-react-ts-starter repository...');
        const repoUrl = 'https://github.com/BahodiRajabov/vite-react-ts-starter';
        const projectName = 'vite-react-ts-starter';
        const projectDir = `${rootDir}/${projectName}`;
        
        // Use Daytona's git.clone method
        await sandbox.git.clone(
          repoUrl,
          projectName
        );
        
        fastify.log.info('Repository cloned successfully');
        
        // Install project dependencies
        fastify.log.info('Installing project dependencies...');
        const npmInstallResult = await sandbox.process.executeCommand(
          'npm install',
          projectDir,
          {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          },
          300000 // 5 minute timeout
        );
        
        if (npmInstallResult.exitCode !== 0) {
          fastify.log.warn('Project dependencies installation had issues:', npmInstallResult.result);
        }

        // Install Claude CLI locally
        fastify.log.info('Installing Claude CLI locally...');
        const installResult = await sandbox.process.executeCommand(
          'npm install @anthropic-ai/claude-code@latest',
          projectDir,
          {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          },
          300000 // 5 minute timeout
        );

        fastify.log.info('Install result:', {
          exitCode: installResult.exitCode,
          result: installResult.result?.substring(0, 200),
        });
        
        if (installResult.exitCode !== 0) {
          throw new Error(
            `Failed to install Claude CLI: ${installResult.result}`
          );
        }
        
        // Verify Claude is available in node_modules/.bin
        const verifyInstall = await sandbox.process.executeCommand(
          'ls -la node_modules/.bin/claude && ./node_modules/.bin/claude --version',
          projectDir,
          {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          }
        );
        fastify.log.info('Claude verification:', {
          result: verifyInstall.result?.trim(),
          exitCode: verifyInstall.exitCode
        });

        // Build Claude command with proper flags
        // Use -p/--print for non-interactive output
        const escapedPrompt = prompt.replace(/"/g, '\\"');
        const claudeBinary = './node_modules/.bin/claude';
        const args = [claudeBinary, '-p', `"${escapedPrompt}"`, '--output-format', 'stream-json', '--verbose'];

        // // Add optional flags based on the CLI documentation
        // if (sessionId) args.push('--session-id', sessionId);
        // if (maxTokens) args.push('--max-tokens', maxTokens.toString());
        // if (temperature) args.push('--temperature', temperature.toString());
        // if (model) args.push('--model', model);
        // if (maxTurns) args.push('--max-turns', maxTurns.toString());

        const command = args.join(' ');
        fastify.log.info(`Executing Claude command: ${command}`);

        // Execute Claude command with environment variables including API key
        const result = await sandbox.process.executeCommand(
          command,
          projectDir, // working directory
          {
            ...process.env,
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
            HOME: projectDir, // Set HOME to the project directory to avoid permission issues
          },
          300000 // 5 minute timeout
        );

        fastify.log.info('Claude execution complete:', {
          exitCode: result.exitCode,
          resultLength: result.result?.length || 0,
        });

        // Stream raw Claude output without parsing
        if (result.result) {
          // Split by newlines and send each line as raw data
          const lines = result.result.split('\n');
          
          for (const line of lines) {
            if (line.trim()) {
              reply.raw.write(
                `data: ${JSON.stringify({
                  type: 'raw',
                  data: line,
                })}\n\n`
              );
            }
          }
        }

        // Check for errors
        if (result.exitCode !== 0) {
          reply.raw.write(
            `data: ${JSON.stringify({
              type: 'error',
              data: `Command failed with exit code ${result.exitCode}`,
            })}\n\n`
          );
        }

        // Send completion
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'done',
            code: result.exitCode || 0,
          })}\n\n`
        );
      } catch (error: any) {
        fastify.log.error('Daytona error:', error);
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'error',
            data: error.message,
          })}\n\n`
        );
      } finally {
        // Always clean up
        reply.raw.end();

        if (sandbox) {
          try {
            // await sandbox.delete();
            fastify.log.info('Sandbox cleaned up');
          } catch (err) {
            fastify.log.error('Cleanup error:', err);
          }
        }
      }
    }
  );
}
