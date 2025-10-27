import { Hono } from 'hono'
import { deployToDispatch, buildDeploymentConfig, parseWranglerConfig } from '../services/deploy'
import type { Env } from '../env'
import type { AssetManifest, WranglerConfig } from '../services/deploy'

const deploy = new Hono<{ Bindings: Env }>()

interface DeployRequest {
  wranglerConfig: string | WranglerConfig
  workerContent: string
  assetsManifest?: AssetManifest
  files?: Array<{ path: string; base64: string }>
  additionalModules?: Array<{ name: string; content: string }>
  compatibilityFlags?: string[]
  assetsConfig?: WranglerConfig['assets']
}

deploy.post('/', async (c) => {
  try {
    const body = await c.req.json<DeployRequest>()

    const accountId = c.env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = c.env.CLOUDFLARE_API_TOKEN
    if (!accountId || !apiToken) {
      return c.json({ error: 'Missing Cloudflare credentials' }, 400)
    }

    const dispatchNamespace = c.env.DISPATCH_NAMESPACE_NAME
    console.log('dispatchNamespace', dispatchNamespace)
    if (!dispatchNamespace) {
      return c.json({ error: 'Dispatch namespace is required' + dispatchNamespace }, 400)
    }

    const wranglerConfig =
      typeof body.wranglerConfig === 'string'
        ? parseWranglerConfig(body.wranglerConfig)
        : body.wranglerConfig

    const fileContents = body.files?.length
      ? new Map(body.files.map((f) => [f.path, Buffer.from(f.base64, 'base64')]))
      : undefined

    const additionalModules = body.additionalModules?.length
      ? new Map(body.additionalModules.map((m) => [m.name, m.content]))
      : undefined

    const deployConfig = buildDeploymentConfig(
      wranglerConfig,
      body.workerContent,
      accountId,
      apiToken,
      body.assetsManifest,
      body.compatibilityFlags
    )

    await deployToDispatch(
      { ...deployConfig, dispatchNamespace },
      fileContents,
      additionalModules,
      body.assetsConfig
    )

    return c.json({ success: true })
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed',
      },
      500
    )
  }
})

export default deploy


