import { Hono } from 'hono'
import type { Env } from '../env'

const dispatch = new Hono<{ Bindings: Env }>()

function extractSubdomain(hostname: string): string | null {
  const parts = hostname.split('.')
  return parts.length >= 2 ? parts[0] || null : null
}

function extractWorkerFromPath(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean)
  return segments.length > 0 ? segments[0] : null
}

dispatch.all('/*', async (c) => {
  if (!c.env.dispatcher) {
    return c.text('Dispatcher binding is not configured', 500)
  }

  const url = new URL(c.req.url)
  let workerName = extractSubdomain(url.hostname)

  if (!workerName) {
    workerName = extractWorkerFromPath(url)
    if (workerName) {
      const segments = url.pathname.split('/').filter(Boolean)
      url.pathname = segments.length > 1 ? `/${segments.slice(1).join('/')}` : '/'
    }
  }

  if (!workerName) {
    return c.notFound()
  }

  try {
    const worker = c.env.dispatcher.get(workerName)
    const targetRequest = new Request(url.toString(), c.req.raw)
    return await worker.fetch(targetRequest)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.text(`Dispatch failed: ${message}`, 502)
  }
})

export default dispatch


