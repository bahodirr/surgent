import type { Context } from 'hono'
import type { ProxyProvider } from './index'

export const openai: ProxyProvider = {
  async handle(c: Context) {
    const path = c.req.path.replace('/api/proxy/openai', '')
    
    const apiKey = c.env.OPENAI_API_KEY
    if (!apiKey) {
      return c.json({ error: 'OpenAI configuration missing' }, 500)
    }

    const upstreamUrl = `https://api.openai.com${path}`
    
    const headers = new Headers(c.req.raw.headers)
    headers.set('Authorization', `Bearer ${apiKey}`)
    headers.delete('host')
    headers.delete('connection')
    headers.delete('cf-connecting-ip') 

    try {
      const response = await fetch(upstreamUrl, {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
      })
      
      return new Response(response.body, response)
    } catch (err) {
      console.error('[Proxy] OpenAI failed', err)
      return c.json({ error: 'Upstream request failed' }, 502)
    }
  }
}


