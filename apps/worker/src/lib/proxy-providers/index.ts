import type { Context } from 'hono'

export interface ProxyProvider {
  handle(c: Context): Promise<Response>
}

import { openai } from './openai'
import { anthropic } from './anthropic'

export const providers: Record<string, ProxyProvider> = {
  openai,
  anthropic,
}

