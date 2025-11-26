import type { Context } from 'hono'
import type { ProxyProvider } from './index'

export const anthropic: ProxyProvider = {
  async handle(c: Context) {
    const path = c.req.path.replace('/api/proxy/anthropic', '')

    const apiKey = (c.env as any).ANTHROPIC_API_KEY
    if (!apiKey) {
      return c.json({ error: 'Anthropic configuration missing' }, 500)
    }

    const upstreamUrl = `https://api.anthropic.com${path}`

    const headers = new Headers(c.req.raw.headers)
    headers.set('Authorization', `Bearer ${apiKey}`)
    headers.delete('host')
    headers.delete('cf-connecting-ip') 
    headers.delete('connection')

    try {
      const response = await fetch(upstreamUrl, {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
      })
      return response
    } catch (err) {
      console.error('[Proxy] Anthropic failed', err)
      return c.json({ error: 'Upstream request failed' }, 502)
    }
  }
}



