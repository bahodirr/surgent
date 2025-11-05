import { config } from '@/lib/config'

async function convexApi(path: string, init?: RequestInit) {
  if (!config.convex.teamToken || !config.convex.teamId) {
    throw new Error('Missing CONVEX_TEAM_TOKEN or CONVEX_TEAM_ID')
  }

  const base = config.convex.host || 'https://api.convex.dev'
  const res = await fetch(`${base}/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.convex.teamToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Convex API ${res.status}`)
  }

  return res.json()
}

export interface ConvexProject {
  projectId: string
  projectSlug: string
  deploymentName: string
  deploymentUrl: string
}

export async function createProjectOnTeam(args: {
  name: string
  deploymentType?: 'dev' | 'prod'
}): Promise<ConvexProject> {
  const body: any = await convexApi(`/teams/${config.convex.teamId}/create_project`, {
    method: 'POST',
    body: JSON.stringify({
      projectName: args.name,
      deploymentType: args.deploymentType ?? 'dev',
    }),
  })

  return {
    projectId: body.projectId,
    projectSlug: body.projectSlug,
    deploymentName: body.deploymentName,
    deploymentUrl: body.deploymentUrl,
  }
}

export async function createDeployKey(deploymentName: string): Promise<string> {
  const body: any = await convexApi(`/deployments/${encodeURIComponent(deploymentName)}/create_deploy_key`, {
    method: 'POST',
    body: JSON.stringify({ name: 'surgent' }),
  })
  return body.deployKey
}

export async function setDeploymentEnvVars(
  deploymentUrl: string,
  deployKey: string,
  vars: Record<string, string>
): Promise<void> {
  const changes = Object.entries(vars).map(([name, value]) => ({ name, value }))
  if (!changes.length) return

  const res = await fetch(`${deploymentUrl}/api/update_environment_variables`, {
    method: 'POST',
    headers: {
      Authorization: `Convex ${deployKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ changes }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Set env vars failed: ${res.status}`)
  }
}

export async function listDeploymentEnvVars(
  deploymentUrl: string,
  deployKey: string
): Promise<Record<string, string>> {
  const res = await fetch(`${deploymentUrl}/api/v1/list_environment_variables`, {
    method: 'GET',
    headers: {
      Authorization: `Convex ${deployKey}`,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `List env vars failed: ${res.status}`)
  }

  const body: any = await res.json()
  return body.environmentVariables || {}
}
