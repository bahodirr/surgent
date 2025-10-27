import { Hono } from 'hono'
import { Configuration, SandboxApi } from '@daytonaio/api-client'
import type { Env } from '../env'

const preview = new Hono<{ Bindings: Env }>()

function getSandboxIdAndPort(host: string, defaultPort: number) {
  const subdomain = host.split(':')[0].split('.')[0]
  const segments = subdomain.split('-')
  const first = segments[0]
  if (/^\d+$/.test(first) && segments.length >= 2) {
    return { sandboxId: segments.slice(1).join('-'), port: parseInt(first, 10) }
  }
  return { sandboxId: subdomain, port: defaultPort }
}

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

async function ensureSandboxRunning(api: SandboxApi, sandboxId: string): Promise<void> {
  try {
    const info = await api.getSandbox(sandboxId)
    const state = String((info.data as any)?.state || '').toLowerCase()
    if (state === 'stopped' || state === 'archived') {
      try {
        await api.startSandbox(sandboxId)
      } catch {}
    }
  } catch {}
}

preview.all('/*', async (c) => {
  const url = new URL(c.req.url)
  const defaultPort = Number(c.env.DEFAULT_SANDBOX_PORT || '3000')
  const { sandboxId, port } = getSandboxIdAndPort(url.hostname, defaultPort)

  if (!c.env.DAYTONA_API_URL || !c.env.DAYTONA_API_KEY) {
    return c.text('Daytona not configured', 500)
  }

  try {
    const api = createSandboxApi(c.env)
    await ensureSandboxRunning(api, sandboxId)

    const previewResp = await api.getPortPreviewUrl(sandboxId, port)
    const previewUrl = previewResp.data.url as string
    const token = previewResp.data.token as string

    const targetUrl = new URL(previewUrl)
    targetUrl.pathname = `${targetUrl.pathname.replace(/\/$/, '')}${url.pathname}`
    targetUrl.search = url.search

    const headers = new Headers(c.req.raw.headers)
    headers.set('x-daytona-preview-token', token)
    headers.set('x-daytona-skip-preview-warning', 'true')
    headers.delete('host')

    const proxied = new Request(targetUrl.toString(), {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
    })

    return await fetch(proxied)
  } catch {
    return c.text('Upstream unavailable', 502)
  }
})

export default preview

