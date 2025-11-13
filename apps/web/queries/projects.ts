import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { ProjectsSchema, CreateProjectResponseSchema, ProjectSchema } from '@/lib/schemas/project'
import { z } from 'zod'

async function fetchProjects() {
  const data = await http.get('api/projects').json()
  return ProjectsSchema.parse(data)
}

async function postProject(githubUrl: string, name: string, initConvex: boolean) {
  const data = await http.post('api/projects', { json: { githubUrl, name, initConvex } }).json()
  return CreateProjectResponseSchema.parse(data)
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

export function useProjectQuery(id?: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id as string),
    enabled: Boolean(id),
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


