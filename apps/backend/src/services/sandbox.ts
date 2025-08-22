import {
  createDaytonaProvider,
  SandboxInstance,
} from "../agentic/sandbox/daytona";
import { projectService } from "./project";
import { db } from "../kysely_db";

export interface SandboxMetadata {
  preview_url?: string | null;
  status?: "started" | "stopped" | "archived" | "unknown";
  template?: string | null;
  isInitialized?: boolean;
  last_accessed_at?: string;
  created_at?: string;
}

export interface SandboxInfo {
  sandboxId: string | null;
  metadata: SandboxMetadata | null;
}

export class SandboxService {
  private async isHeadOk(url: string, timeoutMs = 5000): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async ensureDevServerRunning(sandbox: SandboxInstance): Promise<void> {
    // Ensure project directory and PM2 ecosystem config exist at /tmp/project
    try {
      const statusCheck = await sandbox.commands.run(
        "pm2 describe vite-dev-server"
      );
      if (statusCheck.exitCode === 0) {
        const listResult = await sandbox.commands.run("pm2 jlist");
        try {
          const processes = JSON.parse(listResult.stdout || "[]");
          const viteProcess = processes.find(
            (p: any) => p.name === "vite-dev-server"
          );
          if (viteProcess?.pm2_env?.status === "online") {
            return;
          }
          await sandbox.commands.run("pm2 restart vite-dev-server");
          const statusCheck = await sandbox.commands.run(
            "pm2 describe vite-dev-server"
          );
          console.log(statusCheck, "Check if running now");

          return;
        } catch {
          await sandbox.commands.run("pm2 restart vite-dev-server");
          return;
        }
      }
    } catch {
      // fallthrough to start new
    }

    await sandbox.commands.run(
      "cd /tmp/project && pm2 start ecosystem.config.cjs"
    );
    await sandbox.commands.run("pm2 save");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  async get(projectId: string, userId: string): Promise<SandboxInfo | null> {
    const project = await projectService.getProject(projectId, userId);
    if (!project) return null;

    return {
      sandboxId: project.sandbox_id,
      metadata: project.sandbox_metadata,
    };
  }

  async set(
    projectId: string,
    userId: string,
    input: { sandboxId: string; metadata?: SandboxMetadata }
  ): Promise<SandboxInfo> {
    const project = await projectService.getProject(projectId, userId);
    if (!project) throw new Error("Project not found");

    const currentMeta = (project.sandbox_metadata as any) || {};
    const metadata: SandboxMetadata = {
      ...currentMeta,
      ...input.metadata,
      created_at: currentMeta?.created_at || new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
    };

    const updated = await db
      .updateTable("projects")
      .set({
        sandbox_id: input.sandboxId,
        sandbox_metadata: JSON.stringify(metadata) as any,
      })
      .where("id", "=", projectId)
      .where("profile_id", "=", project.profile_id)
      .returning(["sandbox_id", "sandbox_metadata"])
      .executeTakeFirstOrThrow();

    return {
      sandboxId: updated.sandbox_id ?? null,
      metadata: (updated.sandbox_metadata as any) || null,
    };
  }

  async updateMetadata(
    projectId: string,
    userId: string,
    partial: SandboxMetadata
  ): Promise<SandboxInfo> {
    const project = await projectService.getProject(projectId, userId);
    if (!project) throw new Error("Project not found");

    const merged: SandboxMetadata = {
      ...((project.sandbox_metadata as any) || {}),
      ...partial,
      last_accessed_at: new Date().toISOString(),
    };

    const updated = await db
      .updateTable("projects")
      .set({
        sandbox_metadata: JSON.stringify(merged) as any,
      })
      .where("id", "=", projectId)
      .where("profile_id", "=", project.profile_id)
      .returning(["sandbox_id", "sandbox_metadata"])
      .executeTakeFirstOrThrow();

    return {
      sandboxId: updated.sandbox_id ?? null,
      metadata: (updated.sandbox_metadata as any) || null,
    };
  }

  async clear(
    projectId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    const project = await projectService.getProject(projectId, userId);
    if (!project) throw new Error("Project not found");

    await db
      .updateTable("projects")
      .set({
        sandbox_id: null,
        sandbox_metadata: null as any,
      })
      .where("id", "=", projectId)
      .where("profile_id", "=", project.profile_id)
      .execute();

    return { success: true };
  }

  async getOrCreateSandbox(
    projectId: string,
    userId: string,
    options?: {
      snapshotName?: string;
      port?: number;
      anthropicApiKey?: string;
    }
  ): Promise<SandboxInstance> {
    const project = await projectService.getProject(projectId, userId);
    if (!project) throw new Error("Project not found");

    const snapshotName = options?.snapshotName ?? "claude-code-env:1.0.0";
    const port = options?.port ?? 3000;
    const daytonaApiKey = process.env.DAYTONA_API_KEY;
    const provider = createDaytonaProvider({
      apiKey: daytonaApiKey,
      snapshot: snapshotName,
    });

    if (project.sandbox_id) {
      try {
        const sandbox = await provider.resume(project.sandbox_id);
        await this.ensureDevServerRunning(sandbox);
        const url = await sandbox.getHost(port);
        await this.updateMetadata(projectId, userId, {
          preview_url: url,
          status: "started",
        });
        return sandbox;
      } catch {
        // Not found or failed → create new
      }
    }

    const anthropicApiKey =
      options?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is required");
    }

    const sandbox = await provider.create(
      { ANTHROPIC_API_KEY: anthropicApiKey },
      undefined,
      "/tmp/project"
    );

    await this.set(projectId, userId, {
      sandboxId: sandbox.sandboxId,
      metadata: { status: "unknown" },
    });

    return sandbox;
  }
}

export const sandboxService = new SandboxService();
