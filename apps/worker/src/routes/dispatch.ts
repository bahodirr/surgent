import { Hono } from 'hono'
import type { AppContext } from '@/types/application'

const dispatch = new Hono<AppContext>()

function extractSubdomain(hostname: string): string | null {
  const parts = hostname.split('.')
  // Return subdomain if it exists and hostname has at least 2 parts
  return parts.length >= 2 ? parts[0] || null : null
}

dispatch.all('/*', async (c) => {
  const url = new URL(c.req.url)
  const subdomain = extractSubdomain(url.hostname)

  // If subdomain is 'api' or empty, skip dispatch - let backend routes handle it
  if (!subdomain || subdomain === 'api') {
    return c.notFound()
  }

  // Check dispatcher binding is configured
  if (!c.env.dispatcher) {
    return c.text('Dispatcher binding is not configured', 500)
  }

  // Dispatch to worker named after the subdomain
  try {
    const worker = c.env.dispatcher.get(subdomain)
    const targetRequest = new Request(url.toString(), c.req.raw)
    return await worker.fetch(targetRequest)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.text(`Dispatch failed: ${message}`, 502)
  }
})

export default dispatch


