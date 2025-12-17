import { Hono } from 'hono'
import { Configuration, SandboxApi } from '@daytonaio/api-client'
import { db } from '@repo/db'
import { requireAuth } from '../middleware/auth'
import type { AppContext } from '@/types/application'

const agent = new Hono<AppContext>()

function createSandboxApi(env: Env): SandboxApi {
  const basePath = env.DAYTONA_API_URL || 'https://app.daytona.io/api'
  const apiKey = env.DAYTONA_API_KEY
  return new SandboxApi(
    new Configuration({
      basePath,
      baseOptions: { headers: { Authorization: `Bearer ${apiKey}` } },
    })
  )
}

// Proxy all OpenCode endpoints: /api/agent/:id/* → Daytona preview URL for port 4096
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

  if (!c.env.DAYTONA_API_URL || !c.env.DAYTONA_API_KEY) {
    return c.text('Daytona not configured', 500)
  }

  try {
    const api = createSandboxApi(c.env)
    const previewResp = await api.getPortPreviewUrl(sandbox.id, 4096)
    const previewUrl = previewResp.data.url as string
    const token = previewResp.data.token as string

    const url = new URL(c.req.url)
    const path = url.pathname.replace(`/api/agent/${projectId}`, '')
    const targetUrl = new URL(previewUrl)
    targetUrl.pathname = `${targetUrl.pathname.replace(/\/$/, '')}${path}`
    targetUrl.search = url.search

    const headers = new Headers(c.req.raw.headers)
    headers.set('x-daytona-preview-token', token)
    headers.set('x-daytona-skip-preview-warning', 'true')
    headers.delete('host')
    console.log("proxied request to", targetUrl.toString());

    const accept = headers.get('accept') || ''
    const isSse = accept.includes('text/event-stream') || path === '/event' || path === '/global/event'

    const upstreamReq = new Request(targetUrl.toString(), {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
      signal: c.req.raw.signal,
    })

    const upstreamResp = await fetch(upstreamReq)
    if (!isSse) return upstreamResp

    // Prevent buffering/caching by intermediaries (OpenCode heartbeats every 30s)
    const outHeaders = new Headers(upstreamResp.headers)
    outHeaders.set('cache-control', 'no-cache, no-transform')

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: outHeaders,
    })
  } catch {
    return c.text('Upstream unavailable', 502)
  }
})

export default agent


