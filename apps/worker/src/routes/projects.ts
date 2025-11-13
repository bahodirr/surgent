import { Hono } from 'hono'
import type { AppContext } from '@/types/application'
import { db } from '@repo/db'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../middleware/auth'
import { deployProject, initializeProject, resumeProject, deployConvexProd } from '@/controllers/projects'
import { listDeploymentEnvVars, setDeploymentEnvVars } from '@/apis/convex'

const projects = new Hono<AppContext>()

const idParam = z.object({ id: z.string() })

projects.use('*', async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Unauthorized' }, 401)
  return next()
})

function sanitizeDeployName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
}

// removed unused Daytona sandbox client helper

// GET /projects - List all projects for user
projects.get('/', requireAuth, async (c) => {
  const rows = await db
    .selectFrom('project')
    .selectAll()
    .where('userId', '=', c.get('user')!.id)
    .orderBy('createdAt', 'desc')
    .execute()
  return c.json(rows)
})

// GET /projects/:id - Get single project
projects.get('/:id', zValidator('param', idParam), async (c) => {
  const { id } = c.req.valid('param')
  const row = await db.selectFrom('project').selectAll().where('id', '=', id).executeTakeFirst()

  if (!row) return c.json({ error: 'Project not found' }, 404)
  if (row.userId !== c.get('user')!.id) return c.json({ error: 'Forbidden' }, 403)
  return c.json(row)
})

// POST /projects - Create + Initialize project (no id provided by client)
projects.post(
  '/',
  zValidator('json', z.object({ 
    githubUrl: z.string(), 
    name: z.string().optional(),
    initConvex: z.boolean().optional()
  })),
  async (c) => {
    const { githubUrl, name, initConvex } = c.req.valid('json')


    const result = await initializeProject({
      githubUrl,
      userId: c.get('user')!.id,
      name,
      initConvex,
    })

    return c.json({ id: result.projectId })
  },
)
// POST /projects/:id/deploy - Deploy project to Cloudflare
projects.post('/:id/deploy', zValidator('param', idParam), zValidator('json', z.object({ deployName: z.string().optional() })), async (c) => {
  try {
    const { id } = c.req.valid('param')
    const { deployName } = c.req.valid('json')

    console.log('[deploy] request', { projectId: id, userId: c.get('user')?.id, deployName })

    const row = await db.selectFrom('project').selectAll().where('id', '=', id).executeTakeFirst()
    if (!row) return c.json({ error: 'Project not found' }, 404)
    if (row.userId !== c.get('user')!.id) return c.json({ error: 'Forbidden' }, 403)

    const name = deployName ? sanitizeDeployName(deployName) : undefined
    const previewUrl = name ? `https://${name}.surgent.dev` : undefined

    await db.updateTable('project').set({
      deployment: { ...(row.deployment as any || {}), status: 'queued', name, previewUrl },
      updatedAt: new Date(),
    }).where('id', '=', id).execute()

    c.executionCtx.waitUntil(
      deployProject({ projectId: id, deployName: name }).catch((err) => {
        console.error('[deploy] background failed', { projectId: id, error: err?.message ?? String(err) })
      })
    )

    console.log('[deploy] scheduled', { projectId: id })
    return c.json({ scheduled: true })
  } catch (err: any) {
    console.error('[deploy] request failed', { userId: c.get('user')?.id, error: err?.message ?? String(err) })
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// POST /projects/:id/activate - Resume project sandbox (alias)
projects.post(
  '/:id/activate',
  zValidator('param', idParam),
  async (c) => {
    const { id } = c.req.valid('param')
    const row = await db.selectFrom('project').selectAll().where('id', '=', id).executeTakeFirst()
    if (!row) return c.json({ error: 'Project not found' }, 404)
    if (row.userId !== c.get('user')!.id) return c.json({ error: 'Forbidden' }, 403)

    const sandboxId = row.sandbox?.id
    if (!sandboxId) return c.json({ error: 'Sandbox not found' }, 400)

    c.executionCtx.waitUntil(
      resumeProject({ projectId: id, sandboxId }).catch(() => {})
    )

    return c.json({ scheduled: true })
  },
)

// Convex prod deploy (promote)
projects.post('/:id/convex/deploy/prod', zValidator('param', idParam), async (c) => {
  const { id } = c.req.valid('param')
  const row = await db.selectFrom('project').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) return c.json({ error: 'Project not found' }, 404)
  if (row.userId !== c.get('user')!.id) return c.json({ error: 'Forbidden' }, 403)

  await deployConvexProd({ projectId: id })
  return c.json({ deployed: true })
})

// GET /projects/:id/convex/env - List all environment variables
projects.get('/:id/convex/env', zValidator('param', idParam), async (c) => {
  const { id } = c.req.valid('param')
  const row = await db.selectFrom('project').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) return c.json({ error: 'Project not found' }, 404)
  if (row.userId !== c.get('user')!.id) return c.json({ error: 'Forbidden' }, 403)

  const convex = (row.metadata as any)?.convex
  if (!convex?.deploymentUrl || !convex?.deployKey) {
    return c.json({ error: 'Convex not provisioned' }, 400)
  }

  const vars = await listDeploymentEnvVars(convex.deploymentUrl, convex.deployKey)
  return c.json({ environmentVariables: vars })
})

// POST /projects/:id/convex/env - Update environment variables
projects.post(
  '/:id/convex/env',
  zValidator('param', idParam),
  zValidator('json', z.object({ vars: z.record(z.string(), z.string()) })),
  async (c) => {
    const { id } = c.req.valid('param')
    const { vars } = c.req.valid('json')
    
    const row = await db.selectFrom('project').selectAll().where('id', '=', id).executeTakeFirst()
    if (!row) return c.json({ error: 'Project not found' }, 404)
    if (row.userId !== c.get('user')!.id) return c.json({ error: 'Forbidden' }, 403)

    const convex = (row.metadata as any)?.convex
    if (!convex?.deploymentUrl || !convex?.deployKey) {
      return c.json({ error: 'Convex not provisioned' }, 400)
    }

    await setDeploymentEnvVars(convex.deploymentUrl, convex.deployKey, vars)
    return c.json({ updated: true })
  }
)

export default projects