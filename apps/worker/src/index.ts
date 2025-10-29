import { Hono } from 'hono'
import { cors } from 'hono/cors'
import deploy from './routes/deploy'
import preview from './routes/preview'
import dispatch from './routes/dispatch'
import { getContainer } from '@cloudflare/containers'
import { auth } from '../lib/auth'
import type { AppContext } from '@/types/application'
export { Server } from './containers/Server'

const app = new Hono<AppContext>({
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

// CORS middleware for auth routes
app.use(
  '/api/auth/*',
  cors({
    origin: (origin) => {
      // Allow configured trusted origins
      const trustedOrigins = [
        process.env.CLIENT_ORIGIN || 'http://localhost:3000',
        'http://localhost:3000',
        'http://localhost:3001',
      ]
      return trustedOrigins.includes(origin) ? origin : trustedOrigins[0]
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
)

// Better Auth handler
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

// Session middleware - adds user and session to context
app.use('*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    c.set('user', null)
    c.set('session', null)
    await next()
    return
  }

  c.set('user', session.user)
  c.set('session', session.session)
  await next()
})

app.get('/health', (c) => {
  console.log('health check')
  return c.text('ok')
})

// Example session endpoint
app.get('/api/session', (c) => {
  const session = c.get('session')
  const user = c.get('user')

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return c.json({
    session,
    user,
  })
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
