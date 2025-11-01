import { parse } from 'jsonc-parser'
import { CloudflareAPI } from '@/apis/deployer/api/cloudflare-api'

export interface WranglerConfig {
  name: string
  main: string
  compatibility_date: string
  compatibility_flags?: string[]
  assets?: {
    directory?: string
    not_found_handling?: string
    run_worker_first?: string[]
    binding?: string
  }
  vars?: Record<string, string>
  durable_objects?: { bindings?: Array<{ name: string; class_name: string }> }
  kv_namespaces?: Array<{ binding: string; id: string }>
  d1_databases?: Array<{ binding: string; database_name: string; database_id: string }>
  r2_buckets?: Array<{ binding: string; bucket_name: string }>
  services?: Array<{ binding: string; service: string }>
}

export interface AssetManifest {
  [path: string]: { hash: string; size: number }
}

interface WorkerBinding {
  name: string
  type: string
  class_name?: string
  namespace_id?: string
  database_id?: string
  bucket_name?: string
}

export interface DeployConfig {
  accountId: string
  apiToken: string
  scriptName: string
  compatibilityDate: string
  compatibilityFlags?: string[]
  workerContent: string
  assets?: AssetManifest
  bindings?: WorkerBinding[]
  vars?: Record<string, string>
}

export interface DispatchDeployConfig extends DeployConfig {
  dispatchNamespace: string
}

export function parseWranglerConfig(content: string): WranglerConfig {
  return parse(content) as WranglerConfig
}

function buildBindings(config: WranglerConfig, hasAssets: boolean): WorkerBinding[] {
  const bindings: WorkerBinding[] = []

  if (config.durable_objects?.bindings) {
    bindings.push(
      ...config.durable_objects.bindings.map((b) => ({
        name: b.name,
        type: 'durable_object_namespace',
        class_name: b.class_name,
      }))
    )
  }

  if (config.kv_namespaces) {
    bindings.push(
      ...config.kv_namespaces.map((kv) => ({
        name: kv.binding,
        type: 'kv_namespace',
        namespace_id: kv.id,
      }))
    )
  }

  if (config.d1_databases) {
    bindings.push(
      ...config.d1_databases.map((db) => ({
        name: db.binding,
        type: 'd1',
        database_id: db.database_id,
      }))
    )
  }

  if (config.r2_buckets) {
    bindings.push(
      ...config.r2_buckets.map((r2) => ({
        name: r2.binding,
        type: 'r2_bucket',
        bucket_name: r2.bucket_name,
      }))
    )
  }

  if (config.services) {
    bindings.push(
      ...config.services.map((svc) => ({
        name: svc.binding,
        type: 'service',
      }))
    )
  }

  if (hasAssets && config.assets?.binding) {
    bindings.push({
      name: config.assets.binding,
      type: 'assets',
    })
  }

  return bindings
}

export function buildDeploymentConfig(
  config: WranglerConfig,
  workerContent: string,
  accountId: string,
  apiToken: string,
  assetsManifest?: AssetManifest,
  compatibilityFlags?: string[]
): DeployConfig {
  const hasAssets = assetsManifest && Object.keys(assetsManifest).length > 0
  const bindings = buildBindings(config, hasAssets ?? false)

  return {
    accountId,
    apiToken,
    scriptName: config.name,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: compatibilityFlags || config.compatibility_flags,
    workerContent,
    assets: assetsManifest,
    bindings: bindings.length > 0 ? bindings : undefined,
    vars: config.vars,
  }
}

export async function deployToDispatch(
  config: DispatchDeployConfig,
  fileContents?: Map<string, Buffer>,
  additionalModules?: Map<string, string>,
  assetsConfig?: WranglerConfig['assets']
): Promise<void> {
  const cfApi = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}`
  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
  }

  // If assets, create upload session and upload (use previous stable endpoints)
  let assetJwt: string | undefined
  if (config.assets && fileContents) {
    const api = new CloudflareAPI(config.accountId, config.apiToken)

    // Create session (dispatch-aware)
    const uploadSession = await api.createAssetUploadSession(
      config.scriptName,
      config.assets,
      config.dispatchNamespace,
    )

    // Build maps by hash
    const hashToPath = new Map<string, string>()
    const fileContentsByHash = new Map<string, Buffer>()
    for (const [path, info] of Object.entries(config.assets)) {
      hashToPath.set(info.hash, path)
      const buf = fileContents.get(path)
      if (buf) fileContentsByHash.set(info.hash, buf)
    }

    let token = uploadSession.jwt
    const buckets = uploadSession.buckets || []
    for (const bucket of buckets) {
      const maybeNext = await api.uploadAssetBatch(
        token,
        bucket,
        fileContentsByHash,
        hashToPath,
      )
      if (maybeNext) token = maybeNext
    }
    assetJwt = token
  }

  // Deploy worker using stable API helper (ensures module content type)
  const api = new CloudflareAPI(config.accountId, config.apiToken)
  const metadata: any = {
    main_module: 'index.js',
    compatibility_date: config.compatibilityDate,
    compatibility_flags: config.compatibilityFlags,
  }
  if (assetJwt) metadata.assets = { jwt: assetJwt, config: assetsConfig }
  if (config.bindings) metadata.bindings = config.bindings
  if (config.vars) metadata.vars = config.vars

  await api.deployWorker(
    config.scriptName,
    metadata,
    config.workerContent,
    config.dispatchNamespace,
    additionalModules,
  )
}


