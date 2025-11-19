import { Hono } from 'hono'
import { Configuration, SandboxApi } from '@daytonaio/api-client'
import type { AppContext } from '@/types/application'

const preview = new Hono<AppContext>()

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

preview.all('/*', async (c) => {
  const url = new URL(c.req.url)
  const defaultPort = Number(c.env.DEFAULT_SANDBOX_PORT || '3000')
  const { sandboxId, port } = getSandboxIdAndPort(url.hostname, defaultPort)

  if (!c.env.DAYTONA_API_URL || !c.env.DAYTONA_API_KEY) {
    return c.text('Daytona not configured', 500)
  }

  const accept = c.req.header('Accept')
  try {
    const api = createSandboxApi(c.env)

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

    // Handle WebSocket upgrades (e.g., Vite HMR)
    if (c.req.header('Upgrade') === 'websocket') {
      const wsReq = new Request(targetUrl.toString(), {
        method: c.req.method,
        headers,
      })
      return await fetch(wsReq)
    }

    const proxied = new Request(targetUrl.toString(), {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
    })

    let resp: Response
    try {
      resp = await fetch(proxied)
    } catch {
      return c.html(getErrorHtml(), 502)
    }

    if (resp.status >= 502) {
      if (accept?.includes('text/html')) {
        // @ts-expect-error - Hono types for status code are strict
        return c.html(getErrorHtml(), resp.status)
      }
      return resp
    }

    return resp
  } catch {
    if (accept?.includes('text/html')) {
      return c.html(getErrorHtml(), 502)
    }
    return c.text('Upstream unavailable', 502)
  }
})

function getErrorHtml() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="3">
  <title>Preview Unavailable</title>
  <style>
    :root {
      --background: 255 255 255;
      --foreground: 15 23 42;
      --card: 255 255 255;
      --card-foreground: 15 23 42;
      --primary: 15 23 42;
      --primary-foreground: 248 250 252;
      --muted-foreground: 100 116 139;
      --border: 226 232 240;
      --radius: 0.5rem;
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      height: 100vh;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: rgb(var(--background));
      color: rgb(var(--foreground));
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 24rem;
      border-radius: var(--radius);
      border: 1px solid rgb(var(--border));
      background-color: rgb(var(--card));
      box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    }
    h1 {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      letter-spacing: -0.025em;
    }
    p {
      font-size: 0.875rem;
      color: rgb(var(--muted-foreground));
      margin: 0 0 1.5rem 0;
      line-height: 1.5;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: calc(var(--radius) - 2px);
      font-size: 0.875rem;
      font-weight: 500;
      height: 2.25rem;
      padding: 0 1rem;
      background-color: rgb(var(--primary));
      color: rgb(var(--primary-foreground));
      border: none;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Preview Unavailable</h1>
    <p>The sandbox server is not responding yet. It may still be starting up.</p>
    <button onclick="window.location.reload()">Reload Preview</button>
  </div>
</body>
</html>
  `
}

export default preview

