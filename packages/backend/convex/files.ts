"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createDaytonaProvider } from "./agentic/sandbox/daytona";
import { config } from "./config";
import path from "path";

const posix = path.posix;

type FileInfoOut = {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  modTime?: number;
  mode?: string;
};

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
};

export const listFiles = action({
  args: {
    projectId: v.id("projects"),
    path: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      name: v.string(),
      path: v.string(),
      isDir: v.boolean(),
      size: v.optional(v.number()),
      modTime: v.optional(v.number()),
      mode: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const remote = resolveRemotePath(workingDir, args.path);
    const entries = await sandbox.fs.listFiles(remote);
    return entries.map((entry: any) => {
      const info = normalizeFileInfo(entry);
      const absolutePath = resolveEntryPath(remote, entry);
      const relativePath = toRelativePath(workingDir, absolutePath);
      return { ...info, path: relativePath };
    });
  },
});

export const getFileDetails = action({
  args: { projectId: v.id("projects"), path: v.string() },
  returns: v.object({
    name: v.string(),
    path: v.string(),
    isDir: v.boolean(),
    size: v.optional(v.number()),
    modTime: v.optional(v.number()),
    mode: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const remote = resolveRemotePath(workingDir, args.path);
    const info = await sandbox.fs.getFileDetails(remote);
    return normalizeFileInfo(info);
  },
});

export const getFileTree = action({
  args: {
    projectId: v.id("projects"),
    path: v.optional(v.string()),
    depth: v.optional(v.number()),
    maxEntries: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      name: v.string(),
      path: v.string(),
      isDir: v.boolean(),
      children: v.optional(
        v.array(
          v.object({
            name: v.string(),
            path: v.string(),
            isDir: v.boolean(),
            children: v.optional(v.any()),
          })
        )
      ),
    })
  ),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const start = resolveRemotePath(workingDir, args.path);
    const maxDepth = clamp(args.depth ?? 2, 0, 8);
    const maxEntries = clamp(args.maxEntries ?? 500, 1, 5000);

    const out: TreeNode[] = [];
    let seen = 0;

    async function walk(currentPath: string, currentDepth: number): Promise<TreeNode[]> {
      if (currentDepth > maxDepth) return [];
      const list = await sandbox.fs.listFiles(currentPath);
      const nodes: TreeNode[] = [];
      for (const entry of list) {
        if (seen >= maxEntries) break;
        const info = normalizeFileInfo(entry);
        const absEntryPath = resolveEntryPath(currentPath, entry);
        const relEntryPath = toRelativePath(workingDir, absEntryPath);
        seen += 1;
        if (info.isDir && currentDepth < maxDepth) {
          const children = await walk(absEntryPath, currentDepth + 1);
          nodes.push({ name: info.name, path: relEntryPath, isDir: info.isDir, children });
        } else {
          nodes.push({ name: info.name, path: relEntryPath, isDir: info.isDir });
        }
      }
      return nodes;
    }

    const startInfo = await sandbox.fs.getFileDetails(start).catch(() => undefined);
    if (!startInfo || !isDirectory(startInfo)) {
      // If start is a file or missing, list parent directory
      const parent = posix.dirname(start);
      const children = await walk(parent, 1);
      out.push(...children);
    } else {
      const children = await walk(start, 1);
      out.push(...children);
    }
    return out;
  },
});

export const readFile = action({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    as: v.optional(v.union(v.literal("text"), v.literal("base64"))),
    maxBytes: v.optional(v.number()),
  },
  returns: v.object({ content: v.string(), encoding: v.string() }),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const remote = resolveRemotePath(workingDir, args.path);
    const details = await sandbox.fs.getFileDetails(remote);
    if (isDirectory(details)) throw new Error("Path is a directory");
    const limit = clamp(args.maxBytes ?? 1_000_000, 1, 10_000_000);
    if (typeof (details as any).size === "number" && (details as any).size > limit) {
      throw new Error(`File too large (>${limit} bytes)`);
    }
    const buffer = await sandbox.fs.downloadFile(remote);
    const encoding = args.as === "base64" ? "base64" : "utf8";
    const content = encoding === "base64" ? buffer.toString("base64") : buffer.toString("utf8");
    return { content, encoding } as const;
  },
});

export const createFolder = action({
  args: { projectId: v.id("projects"), path: v.string(), mode: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const remote = resolveRemotePath(workingDir, args.path);
    await sandbox.fs.createFolder(remote, args.mode ?? "755");
    return null;
  },
});

export const deleteFile = action({
  args: { projectId: v.id("projects"), path: v.string(), recursive: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const remote = resolveRemotePath(workingDir, args.path);
    await sandbox.fs.deleteFile(remote, args.recursive ?? false);
    return null;
  },
});

export const moveFiles = action({
  args: { projectId: v.id("projects"), source: v.string(), destination: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const src = resolveRemotePath(workingDir, args.source);
    const dst = resolveRemotePath(workingDir, args.destination);
    await sandbox.fs.moveFiles(src, dst);
    return null;
  },
});

export const uploadFile = action({
  args: { projectId: v.id("projects"), remotePath: v.string(), contentBase64: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const remote = resolveRemotePath(workingDir, args.remotePath);
    const buffer = Buffer.from(args.contentBase64, "base64");
    await sandbox.fs.uploadFile(buffer, remote);
    return null;
  },
});

export const searchFiles = action({
  args: { projectId: v.id("projects"), path: v.string(), pattern: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const p = resolveRemotePath(workingDir, args.path);
    return await sandbox.fs.searchFiles(p, args.pattern);
  },
});

export const findFiles = action({
  args: { projectId: v.id("projects"), path: v.string(), pattern: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const p = resolveRemotePath(workingDir, args.path);
    return await sandbox.fs.findFiles(p, args.pattern);
  },
});

export const replaceInFiles = action({
  args: { projectId: v.id("projects"), files: v.array(v.string()), pattern: v.string(), newValue: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { sandbox, workingDir } = await getSandboxForOwner(ctx, args.projectId);
    const files = args.files.map((f) => resolveRemotePath(workingDir, f));
    return await sandbox.fs.replaceInFiles(files as any, args.pattern, args.newValue);
  },
});

async function getSandboxForOwner(ctx: any, projectId: Id<"projects">): Promise<{ sandbox: any; workingDir: string }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");
  const project = await ctx.runQuery(internal.projects.getProjectInternal, { projectId });
  if (!project) throw new Error("Project not found");
  if (String(project.userId) !== String(userId)) throw new Error("Forbidden");
  if (!project.sandboxId) throw new Error("Sandbox not found");

  const provider = createDaytonaProvider({ apiKey: config.daytona.apiKey, serverUrl: config.daytona.serverUrl });
  const sandbox = await provider.resume(project.sandboxId);
  const workingDir = localWorkspacePath(projectId as Id<"projects">);
  return { sandbox, workingDir } as const;
}

function localWorkspacePath(projectId: Id<"projects">): string {
  const safeProjectId = String(projectId).replace(/[^a-zA-Z0-9_-]+/g, "-");
  return posix.join("/tmp", safeProjectId || "project");
}

function resolveRemotePath(workingDir: string, input?: string): string {
  const normalizedInput = (input ?? ".").trim();
  const cleaned = normalizedInput === "/" || normalizedInput === "." ? "" : normalizedInput.replace(/^\/+/, "");
  const joined = cleaned ? posix.join(workingDir, cleaned) : workingDir;
  const normalized = posix.normalize(joined);
  if (!normalized.startsWith(workingDir)) {
    throw new Error("Invalid path");
  }
  return normalized;
}

function resolveEntryPath(currentDir: string, entry: unknown): string {
  const info = entry as Record<string, any>;
  if (typeof info.path === "string" && info.path.length > 0) {
    return info.path as string;
  }
  const name = typeof info.name === "string" ? info.name : "";
  return name ? posix.join(stripTrailingSlash(currentDir), name) : currentDir;
}

function isDirectory(entry: unknown): boolean {
  const info = entry as Record<string, any>;
  if (typeof info?.isDir === "boolean") return info.isDir;
  if (typeof info?.is_dir === "boolean") return info.is_dir;
  if (typeof info?.type === "string") return info.type === "directory";
  return false;
}

function stripTrailingSlash(input: string): string {
  if (input.length > 1 && input.endsWith("/")) {
    return input.slice(0, -1);
  }
  return input;
}

function normalizeFileInfo(entry: any): FileInfoOut {
  const name = typeof entry.name === "string" && entry.name ? entry.name : posix.basename((entry.path as string) || "");
  const mode = entry.mode || entry.permissions || undefined;
  const modTime = entry.modTime || entry.mod_time || entry.mtimeMs || undefined;
  return {
    name: name || "",
    path: (entry.path as string) || name || "",
    isDir: isDirectory(entry),
    size: typeof entry.size === "number" ? entry.size : undefined,
    modTime: typeof modTime === "number" ? modTime : undefined,
    mode: typeof mode === "string" ? mode : undefined,
  } as const;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toRelativePath(workingDir: string, absolute: string): string {
  const rel = posix.relative(workingDir, absolute);
  return rel || ".";
}


