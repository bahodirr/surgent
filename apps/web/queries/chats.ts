import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { Session, Message, FileDiff } from '@opencode-ai/sdk'

// --- Session list & create ---

async function fetchSessions(projectId: string): Promise<Session[]> {
  const data = await http.get(`api/agent/${projectId}/session`).json()
  const sessions = data as Session[]
  return [...sessions].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
}

type CreateSessionOptions = {
  parentID?: string
  title?: string
}

async function createSession(projectId: string, options?: CreateSessionOptions): Promise<Session> {
  const data = await http.post(`api/agent/${projectId}/session`, { json: options ?? {} }).json()
  return data as Session
}

type FilePartInput = {
  type: 'file'
  mime: string
  filename: string
  url: string
  size: number
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
  const parts: Array<{ type: string; text?: string; mime?: string; filename?: string; url?: string; size?: number }> = []

  if (files?.length) {
    for (const file of files) {
      parts.push({ type: 'file', mime: file.mime, filename: file.filename, url: file.url, size: file.size })
    }
  }

  // Build text with markdown image links for AI
  const imageLinks = files?.length
    ? files.map(f => `![${f.filename}](${f.url})`).join('\n')
    : ''
  const fullText = imageLinks ? `${imageLinks}\n\n${text}` : text

  if (fullText) {
    parts.push({ type: 'text', text: fullText })
  }

  const body: Record<string, unknown> = { agent, parts }

  if (model && model.trim()) {
    body.model = { providerID, modelID: model }
  }

  const data = await http.post(`api/agent/${projectId}/session/${sessionId}/message`, { json: body }).json()
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
  return useMutation<Session, unknown, CreateSessionOptions | void>({
    mutationFn: (options) => createSession(projectId as string, options ?? undefined),
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

async function revertMessage(projectId: string, sessionId: string, messageId: string): Promise<boolean> {
  const data = await http
    .post(`api/agent/${projectId}/session/${sessionId}/revert`, { json: { messageID: messageId } })
    .json()
  return data as boolean
}

async function unrevertSession(projectId: string, sessionId: string): Promise<boolean> {
  const data = await http.post(`api/agent/${projectId}/session/${sessionId}/unrevert`).json()
  return data as boolean
}

export function useRevertMessage(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation<boolean, unknown, { sessionId: string; messageId: string }>({
    mutationFn: ({ sessionId, messageId }) => revertMessage(projectId as string, sessionId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}

export function useUnrevert(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation<boolean, unknown, { sessionId: string }>({
    mutationFn: ({ sessionId }) => unrevertSession(projectId as string, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}

// --- Delete session ---

async function deleteSession(projectId: string, sessionId: string): Promise<boolean> {
  const data = await http.delete(`api/agent/${projectId}/session/${sessionId}`).json()
  return data as boolean
}

export function useDeleteSession(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation<boolean, unknown, { sessionId: string }>({
    mutationFn: ({ sessionId }) => deleteSession(projectId as string, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}

// --- Update session (title) ---

async function updateSession(
  projectId: string,
  sessionId: string,
  updates: { title?: string }
): Promise<Session> {
  const data = await http
    .patch(`api/agent/${projectId}/session/${sessionId}`, { json: updates })
    .json()
  return data as Session
}

export function useUpdateSession(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation<Session, unknown, { sessionId: string; title?: string }>({
    mutationFn: ({ sessionId, ...updates }) =>
      updateSession(projectId as string, sessionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}

// --- Fork session ---

async function forkSession(
  projectId: string,
  sessionId: string,
  messageId?: string
): Promise<Session> {
  const data = await http
    .post(`api/agent/${projectId}/session/${sessionId}/fork`, {
      json: messageId ? { messageID: messageId } : {},
    })
    .json()
  return data as Session
}

export function useForkSession(projectId?: string) {
  const queryClient = useQueryClient()
  return useMutation<Session, unknown, { sessionId: string; messageId?: string }>({
    mutationFn: ({ sessionId, messageId }) =>
      forkSession(projectId as string, sessionId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}

// --- Session diff ---

async function fetchSessionDiff(
  projectId: string,
  sessionId: string,
  messageId?: string
): Promise<FileDiff[]> {
  const url = messageId
    ? `api/agent/${projectId}/session/${sessionId}/diff?messageID=${messageId}`
    : `api/agent/${projectId}/session/${sessionId}/diff`
  const data = await http.get(url).json()
  return data as FileDiff[]
}

export function useSessionDiff(projectId?: string, sessionId?: string, messageId?: string) {
  return useQuery<FileDiff[]>({
    queryKey: ['session-diff', projectId, sessionId, messageId],
    queryFn: () => fetchSessionDiff(projectId as string, sessionId as string, messageId),
    enabled: Boolean(projectId && sessionId),
  })
}

// --- Respond to permission ---

type PermissionResponse = 'once' | 'always' | 'reject'

async function respondPermission(
  projectId: string,
  sessionId: string,
  permissionId: string,
  response: PermissionResponse,
  remember?: boolean
): Promise<boolean> {
  const data = await http
    .post(`api/agent/${projectId}/session/${sessionId}/permissions/${permissionId}`, {
      json: { response, remember },
    })
    .json()
  return data as boolean
}

export function useRespondPermission(projectId?: string, sessionId?: string) {
  return useMutation<
    boolean,
    unknown,
    { permissionId: string; response: PermissionResponse; remember?: boolean }
  >({
    mutationFn: ({ permissionId, response, remember }) =>
      respondPermission(projectId as string, sessionId as string, permissionId, response, remember),
  })
}
