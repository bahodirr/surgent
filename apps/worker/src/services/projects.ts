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

export async function updateProjectMetadata(
  projectId: string,
  metadata: any
): Promise<void> {
  await db
    .updateTable("project")
    .set({
      metadata,
      updatedAt: new Date(),
    })
    .where("id", "=", projectId)
    .execute();
}

export async function updateProjectSandbox(
  projectId: string,
  sandbox: any
): Promise<void> {
  await db
    .updateTable("project")
    .set({
      sandbox,
      updatedAt: new Date(),
    })
    .where("id", "=", projectId)
    .execute();
}

export async function updateDeploymentStatus(
  projectId: string,
  status: string,
  name?: string
): Promise<void> {
  const project = await db
    .selectFrom("project")
    .selectAll()
    .where("id", "=", projectId)
    .executeTakeFirst();

  if (!project) return;

  const deployment = {
    ...((project as any).deployment || {}),
    status,
    ...(name ? { name } : {}),
    updatedAt: new Date(),
  };

  await db
    .updateTable("project")
    .set({
      deployment,
      updatedAt: new Date(),
    })
    .where("id", "=", projectId)
    .execute();
}


