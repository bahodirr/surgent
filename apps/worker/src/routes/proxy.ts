import { Hono } from 'hono'
import type { AppContext } from '@/types/application'
import { handleProxy } from '../lib/proxy-providers'

const proxy = new Hono<AppContext>()

// TODO: Re-enable auth check later
proxy.all('/:provider/*', (c) => {
  const provider = c.req.param('provider')
  const pathSuffix = c.req.path.split('/').slice(2).join('/')
  return handleProxy(c, provider, pathSuffix)
})

export default proxy
