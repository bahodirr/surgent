import { Context, Hono } from 'hono'
import { db } from '@repo/db'
import { requireAuth } from '../middleware/auth'
import type { AppContext } from '@/types/application'

const agent = new Hono<AppContext>()

async function getOpencodeUrl(c: Context<AppContext>, projectId: string) {
  const project = await db.selectFrom('project').selectAll().where('id', '=', projectId).executeTakeFirst()
  if (!project) return c.json({ error: 'Project not found' }, 404)
  if (project.userId !== c.get('user')?.id) return c.json({ error: 'Forbidden' }, 403)
  
  const sandboxId = (project.sandbox as any)?.id
  if (!sandboxId) return c.json({ error: 'Sandbox not found' }, 400)
  
  return `https://4096-${sandboxId}.surgent.dev`
}

// Create session (custom logic)
agent.post('/:id/session', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const baseUrl = await getOpencodeUrl(c, projectId)
  if (baseUrl instanceof Response) return baseUrl

  const body = await c.req.json()
  
  // Forward to OpenCode
  const resp = await fetch(`${baseUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const session = await resp.json()

  // TODO: Add custom logic here (save to DB, etc.)
  
  return c.json(session)
})

// Proxy all other OpenCode endpoints
agent.all('/:id/*', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const baseUrl = await getOpencodeUrl(c, projectId)
  if (baseUrl instanceof Response) return baseUrl

  const url = new URL(c.req.url)
  const path = url.pathname.replace(`/api/agent/${projectId}`, '')
  const target = `${baseUrl}${path}${url.search}`

  return fetch(new Request(target, c.req.raw))
})

export default agent


