import { FastifyInstance } from "fastify";
import { projectService } from "../../services/project";
import { sessionService } from "../../services/session";
import { VibeKit } from "@vibe-kit/sdk";
import { createE2BProvider } from "@vibe-kit/e2b";

interface ClaudeStreamQuery {
  projectId: string;
  prompt: string;
  sessionId?: string;
  model?: string;
  mode?: "ask" | "code";
}
console.log(process.env.E2B_API_KEY);

export default async function (fastify: FastifyInstance) {
  const createVibeKit = (modelOverride?: string) => {
    const e2bProvider = createE2BProvider({
      apiKey: process.env.E2B_API_KEY!,
      templateId: "vibekit-claude",
    });

    const vibeKit = new VibeKit()
      .withAgent({
        type: "claude",
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: "claude-sonnet-4-20250514",
      })
      .withSandbox(e2bProvider);

    return vibeKit;
  };

  // Generate code using VibeKit with Daytona sandbox
  fastify.get<{ Querystring: ClaudeStreamQuery }>(
    "/api/chat/stream",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const user = request.user!;
      const {
        projectId,
        prompt,
        sessionId: sessionIdFromClient,
        model,
        mode,
      } = request.query;

      if (!projectId) {
        return reply.code(400).send({ error: "projectId is required" });
      }
      if (!prompt) {
        return reply.code(400).send({ error: "prompt is required" });
      }

      let vibeKit: VibeKit | null = null;
      try {
        // Verify project ownership
        const project = await projectService.getProject(projectId, user.id);
        if (!project) {
          return reply.code(404).send({ error: "Project not found" });
        }

        // Ensure we have an active app session for this project

        console.log(`🚀 Starting VibeKit generation for project ${projectId}`);
        console.log(`📝 Prompt: ${prompt}`);
        console.log(`🔗 Session ID: ${sessionIdFromClient || "new"}`);

        // Inline VibeKit usage
        vibeKit = createVibeKit(model);
        if (sessionIdFromClient) {
          await vibeKit.setSession(sessionIdFromClient);
        }

        const startedAt = Date.now();
        const generatedResp = await vibeKit.generateCode({
          prompt,
          mode: mode === "code" ? "code" : "ask",
        } as any);
        const duration = Date.now() - startedAt;
        console.log("generatedResp.sandboxId", generatedResp.sandboxId);
        // Set up event listeners for streaming
        vibeKit.on("update", (message) => {
          // Handle streaming updates
          console.log("Streaming update:", message);
          // Update your UI with the new content
        });

        vibeKit.on("error", (error) => {
          // Handle streaming errors
          console.error("Streaming error:", error);
        });

        const newSessionId = await vibeKit.getSession();
        console.log("Generated response", generatedResp.stdout);
        
        console.log(`✅ VibeKit generation completed`);
        console.log(`⏱️ Duration: ${duration}ms`);
        console.log(`🔗 Session ID: ${newSessionId}`);

        // // Store the user message
        // await sessionService.addMessage(
        //   appSession.id,
        //   {
        //     content: prompt,
        //     sender: 'user',
        //     metadata: { vibekit_session_id: newSessionId },
        //   },
        //   user.id
        // );

        // Normalize response text
        // const extractText = (resp: any): string => {
        //   if (typeof resp === 'string') return resp;
        //   if (resp && typeof resp === 'object') {
        //     if (typeof (resp as any).code === 'string') return (resp as any).code; // ClaudeResponse
        //     if (typeof (resp as any).result === 'string') return (resp as any).result;
        //     if (typeof (resp as any).output === 'string') return (resp as any).output;
        //     if (typeof (resp as any).text === 'string') return (resp as any).text;
        //     if (typeof (resp as any).stdout === 'string' && (resp as any).stdout.length > 0) return (resp as any).stdout; // Codex
        //   }
        //   try { return JSON.stringify(resp); } catch { return String(resp); }
        // };

        // // Store the assistant response
        // await sessionService.addMessage(
        //   appSession.id,
        //   {
        //     content: extractText(generatedResp),
        //     sender: 'assistant',
        //     metadata: {
        //       vibekit_session_id: newSessionId,
        //       duration_ms: duration,
        //       model,
        //     },
        //   },
        //   user.id
        // );

        // Update session metadata
        // await sessionService.updateSessionMetadata(
        //   appSession.id,
        //   {
        //     vibekit_session_id: newSessionId,
        //     last_duration_ms: duration,
        //   },
        //   user.id
        // );

        // Return JSON response instead of streaming
        return reply.send({
          success: true,
          // result: extractText(generatedResp),
          sessionId: newSessionId,
          metadata: { duration },
        });
      } catch (error: any) {
        console.error("❌ VibeKit generation error:", error);
        fastify.log.error("VibeKit chat error:", error);
        return reply
          .code(500)
          .send({ error: error?.message || "Unknown error" });
      } finally {
        try {
          await (vibeKit as any)?.kill?.();
        } catch {}
      }
    }
  );
}
