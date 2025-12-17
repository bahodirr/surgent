import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { z } from 'zod'
import type { Session, Message, Part } from '@opencode-ai/sdk'

async function fetchSessions(projectId: string): Promise<Session[]> {
  const data = await http.get(`api/agent/${projectId}/session`).json()
  const sessions = data as Session[]
  return [...sessions].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
}

async function createSession(projectId: string): Promise<Session> {
  const data = await http.post(`api/agent/${projectId}/session`, { json: {} }).json()
  return data as Session
}

type FilePartInput = {
  type: 'file'
  mime: string
  filename: string
  url: string
}

async function sendMessage(
  projectId: string,
  sessionId: string,
  text: string,
  agent: 'plan' | 'build',
  files?: FilePartInput[],
  model?: string,
  providerID?: string
): Promise<Message> {
  const parts: Array<{ type: string; text?: string; mime?: string; filename?: string; url?: string }> = []

  if (files?.length) {
    for (const file of files) {
      parts.push({ type: 'file', mime: file.mime, filename: file.filename, url: file.url })
    }
  }

  if (text) {
    parts.push({ type: 'text', text })
  }

  const body: Record<string, unknown> = { agent, parts }

  if (model && model.trim()) {
    body.model = { providerID, modelID: model }
  }

  // Retry on 5xx (agent might still be starting)
  const data = await http.post(`api/agent/${projectId}/session/${sessionId}/message`, {
    json: body,
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
    queryFn: async () => {
      const sessions = await fetchSessions(projectId as string)
      if (sessions.length === 0) {
        const newSession = await createSession(projectId as string)
        return [newSession]
      }
      return sessions
    },
    enabled: Boolean(projectId),
    staleTime: 10000,
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
  const queryClient = useQueryClient()
  return useMutation<Session, unknown, void>({
    mutationFn: async () => {
      const sessions = await fetchSessions(projectId as string)
      if (sessions?.length) return sessions[0]!
      return createSession(projectId as string)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}

export function useSendMessage(projectId?: string) {
  return useMutation<Message, unknown, { sessionId: string; text: string; agent: 'plan' | 'build'; files?: FilePartInput[]; model?: string; providerID?: string }>({
    mutationFn: ({ sessionId, text, agent, files, model, providerID }) =>
      sendMessage(projectId as string, sessionId, text, agent, files, model, providerID),
  })
}

export function useAbortSession() {
  return useMutation<boolean, unknown, { projectId: string; sessionId: string }>({
    mutationFn: ({ projectId, sessionId }) => abortSession(projectId, sessionId),
  })
}

async function revertMessage(projectId: string, sessionId: string, messageId: string): Promise<Session> {
  const data = await http
    .post(`api/agent/${projectId}/session/${sessionId}/revert`, { json: { messageID: messageId } })
    .json()
  return data as Session
}

async function unrevertSession(projectId: string, sessionId: string): Promise<Session> {
  const data = await http.post(`api/agent/${projectId}/session/${sessionId}/unrevert`).json()
  return data as Session
}

export function useRevertMessage(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation<Session, unknown, { sessionId: string; messageId: string }>({
    mutationFn: ({ sessionId, messageId }) => revertMessage(projectId as string, sessionId, messageId),
    onSuccess: (session) => {
      // Refresh sessions list and messages for this session
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}

export function useUnrevert(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation<Session, unknown, { sessionId: string }>({
    mutationFn: ({ sessionId }) => unrevertSession(projectId as string, sessionId),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}
