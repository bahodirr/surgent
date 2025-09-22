import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import type { Context } from 'hono'
import * as dotenv from 'dotenv'
import { Configuration, SandboxApi } from '@daytonaio/api-client'
import http from 'node:http'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// http-proxy is CommonJS; import via createRequire in ESM
const { createProxyServer } = require('http-proxy')

dotenv.config()

const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY
const PORT = Number(process.env.PORT || 1234)
const DEFAULT_SANDBOX_PORT = Number(process.env.DEFAULT_SANDBOX_PORT || 3000)

if (!DAYTONA_API_KEY) {
  throw new Error('DAYTONA_API_KEY is not set')
}

const sandboxApi = new SandboxApi(
  new Configuration({
    baseOptions: {
      headers: {
        Authorization: `Bearer ${DAYTONA_API_KEY}`,
      },
    },
  })
)

function getSandboxIdAndPortFromHost(host: string) {
  const parts = host.split(':')[0] // strip port if present
  if (parts.split('.').length === 1) {
    throw new Error('Invalid URL')
  }

  const subdomain = parts.split('.')[0]
  const hostname = parts.split('.').slice(1).join('.')

  const segments = subdomain.split('-')
  const firstSegment = segments[0]
  const firstIsPort = /^\d+$/.test(firstSegment)

  if (firstIsPort && segments.length >= 2) {
    const port = parseInt(firstSegment, 10)
    const sandboxId = segments.slice(1).join('-')
    return { sandboxId, port, hostname }
  }

  // No explicit port provided in subdomain; use default
  return { sandboxId: subdomain, port: DEFAULT_SANDBOX_PORT, hostname }
}

type CacheEntry = { url: string; token: string; expiresAt: number }
const previewCache = new Map<string, CacheEntry>()
const PREVIEW_TTL_MS = Number(process.env.PREVIEW_CACHE_TTL_MS || 30_000)

async function resolvePreview(hostHeader: string) {
  const { sandboxId, port } = getSandboxIdAndPortFromHost(hostHeader)
  const cacheKey = `${sandboxId}:${port}`

  const now = Date.now()
  const cached = previewCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached
  }

  const resp = await sandboxApi.getPortPreviewUrl(sandboxId, port)
  const entry: CacheEntry = {
    url: resp.data.url,
    token: resp.data.token as unknown as string,
    expiresAt: now + PREVIEW_TTL_MS,
  }
  previewCache.set(cacheKey, entry)
  return entry
}

function buildTargetUrl(baseUrl: string, path: string, search: string) {
  const u = new URL(baseUrl)
  const joinedPath = `${u.pathname.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
  u.pathname = joinedPath
  u.search = search || ''
  return u.toString()
}

function addForwardHeaders(headers: Headers, original: Request) {
  const url = new URL(original.url)
  const remoteAddr = (original as any).ip || (original as any).clientAddress || ''
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''))
  headers.set('x-forwarded-host', original.headers.get('host') || '')
  headers.set('x-forwarded-port', url.port || (url.protocol === 'https:' ? '443' : '80'))
  headers.set('x-forwarded-for', remoteAddr)
}

const app = new Hono()

app.get('/health', (c) => c.json({ ok: true }))

app.all('*', async (c: Context) => {
  try {
    const host = c.req.header('host')
    if (!host) throw new Error('Invalid URL. Host is required')

    const preview = await resolvePreview(host)

    const targetUrl = buildTargetUrl(
      preview.url,
      c.req.path,
      c.req.query() ? `?${new URLSearchParams(c.req.query()).toString()}` : ''
    )

    const init: RequestInit = {
      method: c.req.method,
      headers: new Headers(c.req.raw.headers),
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : await c.req.raw.clone().arrayBuffer(),
      redirect: 'manual',
    }

    const headers = new Headers(init.headers)
    headers.set('x-daytona-preview-token', preview.token)
    headers.delete('host')
    headers.delete('connection')
    headers.delete('keep-alive')
    headers.delete('transfer-encoding')
    headers.delete('upgrade')
    addForwardHeaders(headers, c.req.raw)
    init.headers = headers

    const resp = await fetch(targetUrl, init)

    if (resp.status >= 400) {
      return serveErrorHtml(c)
    }

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    })
  } catch (err) {
    return serveErrorHtml(c)
  }
})

function serveErrorHtml(c: Context) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Proxy Error</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;color:#111;background:#fafafa} .card{max-width:720px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.04)} h1{font-size:20px;margin:0 0 12px} p{margin:0;color:#444}</style></head><body><div class="card"><h1>Upstream unavailable</h1><p>We couldn't reach the preview service. Please try again in a moment.</p></div></body></html>`
  return c.html(html, 500)
}

const server = serve({ fetch: app.fetch, port: PORT }) as unknown as http.Server

const wsProxy = createProxyServer({ ws: true, changeOrigin: true })

server.on('upgrade', async (req, socket, head) => {
  try {
    const host = req.headers.host
    if (!host) throw new Error('Invalid URL. Host is required')

    const preview = await resolvePreview(host)
    const base = new URL(preview.url)
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
    const target = base.toString()

    req.headers['x-daytona-preview-token'] = preview.token

    wsProxy.ws(req, socket as any, head, { target })
  } catch (e) {
    socket.destroy()
  }
})

// eslint-disable-next-line no-console
console.log(`Proxy server is running on port ${PORT}`)


