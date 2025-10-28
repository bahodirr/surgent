import { Hono } from 'hono'
import deploy from './routes/deploy'
import preview from './routes/preview'
import dispatch from './routes/dispatch'
import { getContainer } from '@cloudflare/containers'
export { Server } from './containers/Server'

const app = new Hono<{ Bindings: Env }>({
  getPath: (req) => {
    const url = new URL(req.url)
    const subdomain = url.hostname.split('.')[0]
    // Do not remap server container routes even on preview subdomains
    if (url.pathname.startsWith('/server')) {
      return url.pathname
    }
    if (subdomain && isPreviewSubdomain(subdomain)) {
      return `/preview${url.pathname}`
    }
    return url.pathname
  },
})

app.get('/health', (c) => {
  console.log('health check')

  return c.text('ok')
})

app.route('/deploy', deploy)
app.route('/preview', preview)


app.all('/server/*', async (c) => {
  const container = getContainer(c.env.SERVER)
  if (!container) return c.text('Server not found', 500)

  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/server/, '')
  
  return container.fetch(new Request(url, c.req.raw))
})
app.route('/', dispatch)

function isPreviewSubdomain(sub: string): boolean {
  if (sub.startsWith('preview-')) return true
  const segments = sub.split('-')
  return segments.length > 1 && /^\d+$/.test(segments[0])
}

export default app
