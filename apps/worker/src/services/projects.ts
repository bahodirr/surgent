import { db } from "@repo/db";

export async function getProjectById(projectId: string) {
  return await db
    .selectFrom("project")
    .selectAll()
    .where("id", "=", projectId)
    .executeTakeFirst();
}

export async function createProject(args: {
  userId: string;
  name: string;
  githubUrl?: string;
}): Promise<{ id: string }> {
  const now = new Date();
  const created = await db
    .insertInto("project")
    .values({
      userId: args.userId,
      name: args.name,
      github: ({ url: args.githubUrl } as any),
      settings: null,
      metadata: null,
      deployment: null,
      sandbox: ({ status: "pending", isInitialized: false } as any),
      createdAt: now,
      updatedAt: now,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  return { id: created.id as string };
}

export async function updateProject(
  projectId: string,
  data: { metadata?: any; sandbox?: any; deployment?: any }
) {
  await db
    .updateTable("project")
    .set({ ...data, updatedAt: new Date() })
    .where("id", "=", projectId)
    .execute();
}

export async function updateDeploymentStatus(projectId: string, status: string, name?: string) {
  const project = await getProjectById(projectId);
  if (!project) return;

  await updateProject(projectId, {
    deployment: {
      ...(project.deployment || {}),
      status,
      ...(name ? { name } : {}),
      updatedAt: new Date(),
    },
  });
}


