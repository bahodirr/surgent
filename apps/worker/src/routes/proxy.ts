import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppContext } from '@/types/application'
import { providers } from '../lib/proxy-providers'
import { auth } from '../lib/auth'

const proxy = new Hono<AppContext>()

proxy.use('*', async (c, next) => {
  if (c.get('user')) return next()
  const token = getBearerToken(c)
  if (token && (await authenticateWithApiKey(c, token))) return next()
  return c.json({ error: 'Unauthorized' }, 401)
})

proxy.all('/:provider/*', async (c) => {
  const providerName = c.req.param('provider')
  const provider = providers[providerName]

  if (!provider) {
    return c.json({ error: `Provider '${providerName}' not supported` }, 400)
  }

  return provider.handle(c)
})

export default proxy

function getBearerToken(c: Context<AppContext>) {
  const header = c.req.header('authorization') || c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

async function authenticateWithApiKey(c: Context<AppContext>, token: string) {
  try {
    const result = await auth.api.verifyApiKey({ body: { key: token } })
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
