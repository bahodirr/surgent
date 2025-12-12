import type { Context } from 'hono'
import type { AppContext } from '@/types/application'

const PROVIDER_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  xai: 'https://api.x.ai/v1',
  vercel: 'https://api.vercel.ai/v1',
  'zai-org': 'https://api.z.ai/api/anthropic',
  moonshotai: 'https://api.moonshot.ai/v1',
}

export async function handleProxy(c: Context<AppContext>, provider: string, pathSuffix: string): Promise<Response> {
  const baseUrl = PROVIDER_URLS[provider]
  if (!baseUrl) {
    return c.json({ error: `Provider '${provider}' not supported` }, 400)
  }

  const incomingUrl = new URL(c.req.url)
  const suffix = pathSuffix ? (pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`) : ''
  const url = `${baseUrl}${suffix}${incomingUrl.search}`

  const headers = new Headers(c.req.raw.headers)
  headers.delete('host')
  headers.delete('connection')
  headers.delete('cf-connecting-ip')

  const apiKey = getProviderKey(c.env, provider)
  if (apiKey) {
    if (provider === 'anthropic') {
      headers.set('x-api-key', apiKey)
      headers.set('anthropic-version', '2023-06-01')
    } else if (provider === 'google') {
      headers.set('x-goog-api-key', apiKey)
      headers.delete('authorization')
    } else {
      headers.set('Authorization', `Bearer ${apiKey}`)
    }
  }

  const response = await fetch(url, {
    method: c.req.method,
    headers,
    body: c.req.raw.body,
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function getProviderKey(env: AppContext['Bindings'], provider: string): string | undefined {
  switch (provider) {
    case 'openai':
      return env.OPENAI_API_KEY
    case 'zai-org':
      return env.Z_AI_API_KEY
    case 'anthropic':
      return (env as any).ANTHROPIC_API_KEY
    case 'google':
      return (env as any).GOOGLE_GENERATIVE_AI_API_KEY || (env as any).GOOGLE_API_KEY
    case 'xai':
      return (env as any).XAI_API_KEY
    case 'vercel':
      return (env as any).VERCEL_API_KEY
    case 'moonshotai':
      return (env as any).MOONSHOT_API_KEY
    default:
      return undefined
  }
}
