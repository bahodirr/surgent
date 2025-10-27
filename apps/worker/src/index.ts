import { Hono } from 'hono'
import deploy from './routes/deploy'
import preview from './routes/preview'
import dispatch from './routes/dispatch'
import type { Env } from './env'

const app = new Hono<{ Bindings: Env }>({
  getPath: (req) => {
    const url = new URL(req.url)
    const subdomain = url.hostname.split('.')[0]
    if (subdomain && isPreviewSubdomain(subdomain)) {
      return `/preview${url.pathname}`
    }
    return url.pathname
  },
})

app.get('/health', (c) => c.text('ok'))

app.route('/deploy', deploy)
app.route('/preview', preview)
app.route('/', dispatch)

function isPreviewSubdomain(sub: string): boolean {
  if (sub.startsWith('preview-')) return true
  const segments = sub.split('-')
  return segments.length > 1 && /^\d+$/.test(segments[0])
}

export default app
