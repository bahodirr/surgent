import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppContext } from '@/types/application'
import { handleProxy } from '../lib/proxy-providers'
import { auth } from '../lib/auth'

const proxy = new Hono<AppContext>()

proxy.use('*', async (c, next) => {
  console.log('[proxy] incoming request:', c.req.method, c.req.path)
  
  if (c.get('user')) {
    console.log('[proxy] user already set, proceeding')
    return next()
  }
  
  const token = getBearerToken(c)
  console.log('[proxy] token present:', !!token, token ? `(${token.slice(0, 8)}...)` : '')
  
  if (token) {
    const authenticated = await authenticateWithApiKey(c, token)
    console.log('[proxy] api key auth result:', authenticated)
    if (authenticated) return next()
  }
  
  console.log('[proxy] unauthorized, rejecting request')
  return c.json({ error: 'Unauthorized' }, 401)
})

proxy.all('/:provider/*', (c) => {
  const provider = c.req.param('provider')
  const url = new URL(c.req.url)
  // Extract path suffix by removing the provider segment from the pathname
  // url.pathname is like "/openai/v1/chat/completions"
  const pathSuffix = url.pathname.split('/').slice(2).join('/')
  
  return handleProxy(c, provider, pathSuffix)
})

export default proxy

function getBearerToken(c: Context<AppContext>) {
  const header = c.req.header('authorization') || c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

async function authenticateWithApiKey(c: Context<AppContext>, token: string) {
  try {
    console.log('[proxy] verifying api key...')
    const result = await auth.api.verifyApiKey({ body: { key: token } })
    console.log('[proxy] verify result:', JSON.stringify({ valid: result.valid, hasKey: !!result.key, userId: result.key?.userId }))
    if (result.valid && result.key?.userId) {
      c.set('user', {
        id: result.key.userId,
        email: null,
        name: result.key.name ?? null,
        emailVerified: true,
      } as any)
      return true
    }
  } catch (err) {
    console.error('[proxy] api key verify failed', err)
  }
  return false
}
