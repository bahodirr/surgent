import { Context, Next } from 'hono'
import type { AppContext } from '@/types/application'

/**
 * Middleware to require authentication on a route
 * Returns 401 if user is not authenticated
 */
export async function requireAuth(
  c: Context<AppContext>,
  next: Next
) {
  const user = c.get('user')
  const session = c.get('session')

  if (!user || !session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return next()
}