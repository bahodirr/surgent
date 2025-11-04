import { Hono } from 'hono'
import { db } from '@repo/db'
import { requireAuth } from '../middleware/auth'
import type { AppContext } from '@/types/application'

const agent = new Hono<AppContext>()

// Proxy all OpenCode endpoints: /api/agent/:id/* → https://4096-{sandbox}.surgent.dev/*
agent.all('/:id/*', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  
  // Validate project and permissions
  const project = await db
    .selectFrom('project')
    .select(['sandbox', 'userId'])
    .where('id', '=', projectId)
    .executeTakeFirst()
  
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.userId !== c.get('user')?.id) return c.json({ error: 'Forbidden' }, 403)
  
  const sandbox = project.sandbox as { id?: string } | null
  if (!sandbox?.id) return c.json({ error: 'Sandbox not found' }, 400)
  
  // Build target URL
  const url = new URL(c.req.url)
  const path = url.pathname.replace(`/api/agent/${projectId}`, '')
  const target = `https://4096-${sandbox.id}.surgent.dev${path}${url.search}`

  // Proxy request
  return fetch(target, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  })
})

export default agent


