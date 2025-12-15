import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { http } from '@/lib/http'
import { ProjectsSchema, CreateProjectResponseSchema, ProjectSchema } from '@/lib/schemas/project'
import { z } from 'zod'

async function fetchProjects() {
  const data = await http.get('api/projects').json()
  return ProjectsSchema.parse(data)
}

async function postProject(githubUrl: string, name: string, initConvex: boolean) {
  try {
    const data = await http.post('api/projects', { json: { githubUrl, name, initConvex } }).json()
    return CreateProjectResponseSchema.parse(data)
  } catch (err) {
    if (err instanceof HTTPError) {
      const body = await err.response.json<{ error?: string }>().catch(() => null)
      throw new Error(body?.error ?? 'Failed to create project')
    }
    throw err
  }
}

export function useProjectsQuery() {
  return useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { githubUrl: string; name?: string; initConvex: boolean }) => postProject(args.githubUrl, args.name ?? '', args.initConvex),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}

// New: single project
async function fetchProject(id: string) {
  const data = await http.get(`api/projects/${id}`).json()
  return ProjectSchema.parse(data)
}

const DEPLOYMENT_IN_PROGRESS_STATUSES = ['queued', 'starting', 'building', 'uploading']

export function useProjectQuery(id?: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id as string),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.deployment?.status
      if (status && DEPLOYMENT_IN_PROGRESS_STATUSES.includes(status)) {
        return 3000 // Poll every 3 seconds while deployment is in progress
      }
      return false
    },
  })
}

// New: activate project
const ScheduledSchema = z.object({ scheduled: z.boolean() })

async function activateProjectReq({ id }: { id: string }) {
  const data = await http.post(`api/projects/${id}/activate`).json()
  // activate returns full project row; accept either shape for resiliency
  try {
    return ProjectSchema.parse(data)
  } catch {
    return ScheduledSchema.parse(data)
  }
}

export function useActivateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: activateProjectReq,
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// New: deploy project
async function deployProjectReq({ id, deployName }: { id: string; deployName?: string }) {
  const data = await http.post(`api/projects/${id}/deploy`, { json: { deployName } }).json()
  return ScheduledSchema.parse(data)
}

export function useDeployProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deployProjectReq,
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// Rename project
async function renameProjectReq({ id, name }: { id: string; name: string }) {
  await http.patch(`api/projects/${id}`, { json: { name } }).json()
}

export function useRenameProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: renameProjectReq,
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// Delete project
async function deleteProjectReq({ id }: { id: string }) {
  await http.delete(`api/projects/${id}`).json()
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteProjectReq,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// Convex dashboard credentials
export interface ConvexDashboardCredentials {
  adminKey: string
  deploymentUrl: string
  deploymentName: string
}

async function fetchConvexDashboard(id: string): Promise<ConvexDashboardCredentials> {
  return http.get(`api/projects/${id}/convex/dashboard`).json()
}

export function useConvexDashboardQuery(id?: string, enabled = true) {
  return useQuery({
    queryKey: ['convex-dashboard', id],
    queryFn: () => fetchConvexDashboard(id!),
    enabled: Boolean(id) && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
