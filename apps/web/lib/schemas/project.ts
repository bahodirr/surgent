import { z } from 'zod'

export const ProjectSandboxSchema = z
  .object({
    id: z.string().optional(),
    previewUrl: z.string().optional(),
    status: z.string().optional(),
    isInitialized: z.boolean().optional(),
    deployed: z.boolean().optional(),
  })
  .nullable()

export const ProjectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  github: z.any().nullable(),
  settings: z.any().nullable(),
  deployment: z.any().nullable(),
  sandbox: ProjectSandboxSchema,
  metadata: z.any().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ProjectsSchema = z.array(ProjectSchema)

export const CreateProjectResponseSchema = z.object({ id: z.string() })

export type Project = z.infer<typeof ProjectSchema>

