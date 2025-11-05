import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { z } from 'zod'
import type { Session, Message, Part } from '@opencode-ai/sdk'

async function fetchSessions(projectId: string): Promise<Session[]> {
  const data = await http.get(`api/agent/${projectId}/session`).json()
  return data as Session[]
}

async function createSession(projectId: string): Promise<Session> {
  const data = await http.post(`api/agent/${projectId}/session`, { json: {} }).json()
  return data as Session
}

async function ensureSession(projectId: string): Promise<Session> {
  const sessions = await fetchSessions(projectId)
  if (sessions?.length) return sessions[0] as Session
  return createSession(projectId)
}

async function sendMessage(
  projectId: string,
  sessionId: string,
  text: string,
  agent: 'plan' | 'build'
): Promise<Message> {
  const data = await http.post(`api/agent/${projectId}/session/${sessionId}/message`, {
    json: { agent, parts: [{ type: 'text', text }] as Array<Part> },
  }).json()
  return data as Message
}

async function abortSession(projectId: string, sessionId: string): Promise<boolean> {
  const data = await http.post(`api/agent/${projectId}/session/${sessionId}/abort`).json()
  return data as boolean
}

export function useSessionsQuery(projectId?: string) {
  return useQuery<Session[]>({
    queryKey: ['sessions', projectId],
    queryFn: () => fetchSessions(projectId as string),
    enabled: Boolean(projectId),
  })
}

export function useCreateSession(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation<Session, unknown, void>({
    mutationFn: () => createSession(projectId as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions', projectId] }),
  })
}

export function useEnsureSession(projectId?: string) {
  return useQuery<Session>({
    queryKey: ['session', 'ensure', projectId],
    queryFn: () => ensureSession(projectId as string),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: false,
  })
}

export function useSendMessage(projectId?: string) {
  return useMutation<Message, unknown, { sessionId: string; text: string; agent: 'plan' | 'build' }>({
    mutationFn: ({ sessionId, text, agent }) =>
      sendMessage(projectId as string, sessionId, text, agent),
  })
}

export function useAbortSession() {
  return useMutation<boolean, unknown, { projectId: string; sessionId: string }>({
    mutationFn: ({ projectId, sessionId }) => abortSession(projectId, sessionId),
  })
}

