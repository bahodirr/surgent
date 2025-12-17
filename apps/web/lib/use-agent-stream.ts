"use client";

import { useEffect, useReducer, useRef } from "react";
import type { Event, Message, Part, Permission, Session, ApiError, ProviderAuthError, UnknownError, MessageOutputLengthError, MessageAbortedError } from "@opencode-ai/sdk";
import { backendBaseUrl, http } from "@/lib/http";

type AgentError = ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | ApiError;

type State = {
  messages: Message[];
  parts: Record<string, Part[]>;
  permissions: Permission[];
  session?: Session;
  status?: { type: string; [key: string]: unknown };
  error?: AgentError;
  lastAt: number;
  connected: boolean;
  loading: boolean;
  compacting: boolean;
};

type StreamEvent = Event | { type: string; properties?: Record<string, any> };

const initialState: State = { messages: [], parts: {}, permissions: [], lastAt: 0, connected: false, loading: false, compacting: false };

function upsertMessage(list: Message[], incoming: Message): Message[] {
  const idx = list.findIndex((m) => m.id === incoming.id);
  if (idx === -1) {
    const insertAt = list.findIndex((m) => m.id > incoming.id);
    if (insertAt === -1) return [...list, incoming];
    return [...list.slice(0, insertAt), incoming, ...list.slice(insertAt)];
  }
  const merged = { ...list[idx], ...incoming } as Message;
  return [...list.slice(0, idx), merged, ...list.slice(idx + 1)];
}

function upsertPart(list: Part[] | undefined, incoming: Part): Part[] {
  if (!list) return [incoming];
  const idx = list.findIndex((p) => p.id === incoming.id);
  if (idx === -1) {
    const insertAt = list.findIndex((p) => p.id > incoming.id);
    if (insertAt === -1) return [...list, incoming];
    return [...list.slice(0, insertAt), incoming, ...list.slice(insertAt)];
  }
  const merged = { ...list[idx], ...incoming } as Part;
  return [...list.slice(0, idx), merged, ...list.slice(idx + 1)];
}

function upsertPermission(list: Permission[] | undefined, incoming: Permission): Permission[] {
  if (!list) return [incoming];
  const idx = list.findIndex((p) => p.id === incoming.id);
  if (idx === -1) return [...list, incoming];
  const merged = { ...list[idx], ...incoming } as Permission;
  return [...list.slice(0, idx), merged, ...list.slice(idx + 1)];
}

function reducer(state: State, event: StreamEvent, currentSessionId?: string): State {
  const props = (event as any).properties;
  const now = Date.now();
  
  if (!props) {
    if (event.type === "session.deleted") {
      return { ...state, session: undefined, status: undefined, messages: [], parts: {}, permissions: [], lastAt: now, loading: true, error: undefined };
    }
    if (event.type === "connection.closed") {
      return { ...state, connected: false, lastAt: now };
    }
    if (event.type === "server.connected") {
      return { ...state, connected: true, lastAt: now };
    }
    if (event.type === "error.clear") {
      return { ...state, error: undefined };
    }
    return { ...state, lastAt: now };
  }
  
  switch (event.type) {
    // Batch load for initial messages - single dispatch instead of N+M
    case "batch.load": {
      const items = props.messages as Array<{ info: Message; parts: Part[] }>;
      if (!items?.length) return { ...state, loading: false, compacting: false, lastAt: now };
      let messages = state.messages;
      const parts: Record<string, Part[]> = { ...state.parts };
      for (const { info, parts: msgParts } of items) {
        if (info.sessionID !== currentSessionId) continue;
        messages = upsertMessage(messages, info);
        // Overwrite even if empty to avoid keeping stale parts after resync.
        if (msgParts !== undefined) parts[info.id] = msgParts;
      }
      return { ...state, messages, parts, lastAt: now, loading: false, compacting: false };
    }
    case "session.updated": {
      const info = props.info as Session;
      if (info.id !== currentSessionId) return state;
      return { ...state, session: info, lastAt: now };
    }
    case "session.deleted": {
      if (props.sessionID !== currentSessionId) return state;
      return { ...state, session: undefined, status: undefined, messages: [], parts: {}, permissions: [], lastAt: now, error: undefined };
    }
    case "session.error": {
      if (props.sessionID && props.sessionID !== currentSessionId) return state;
      return { ...state, error: props.error, lastAt: now };
    }
    case "session.compacted": {
      if (props.sessionID !== currentSessionId) return state;
      return { ...state, messages: [], parts: {}, lastAt: now, loading: true, compacting: true };
    }
    case "message.updated": {
      const info = props.info as Message;
      if (info.sessionID !== currentSessionId) return state;
      return { ...state, messages: upsertMessage(state.messages, info), lastAt: now };
    }
    case "message.removed": {
      const parts = { ...state.parts };
      delete parts[props.messageID];
      return { ...state, messages: state.messages.filter((m) => m.id !== props.messageID), parts, lastAt: now };
    }
    case "message.part.updated": {
      const part = props.part as Part;
      if ((part as any).sessionID !== currentSessionId) return state;
      return { ...state, parts: { ...state.parts, [part.messageID]: upsertPart(state.parts[part.messageID], part) }, lastAt: now };
    }
    case "message.part.removed": {
      const parts = { ...state.parts };
      if (props.sessionID && props.sessionID !== currentSessionId) return state;
      const filtered = parts[props.messageID]?.filter((p) => p.id !== props.partID);
      if (filtered) parts[props.messageID] = filtered;
      else delete parts[props.messageID];
      return { ...state, parts, lastAt: now };
    }
    case "server.connected":
      return { ...state, connected: true, lastAt: now };
    case "session.status": {
      if (props.sessionID !== currentSessionId) return state;
      return { ...state, status: props.status as State["status"], lastAt: now };
    }
    case "session.idle": {
      if (props.sessionID !== currentSessionId) return state;
      return { ...state, status: { type: "idle" }, lastAt: now };
    }
    case "permission.updated": {
      const permission = props as Permission;
      if (permission.sessionID !== currentSessionId) return state;
      return { ...state, permissions: upsertPermission(state.permissions, permission), lastAt: now };
    }
    case "permission.replied": {
      if (props.sessionID !== currentSessionId) return state;
      return { ...state, permissions: state.permissions.filter((p) => p.id !== props.permissionID), lastAt: now };
    }
    default:
      return state;
  }
}

export default function useAgentStream({ projectId, sessionId }: { projectId?: string; sessionId?: string }) {
  // Use ref to avoid stale closure
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const [state, dispatch] = useReducer(
    (state: State, event: StreamEvent) => reducer(state, event, sessionIdRef.current),
    initialState
  );
  const esRef = useRef<EventSource | null>(null);
  const closedRef = useRef(false);
  const currentSessionRef = useRef(sessionId);

  // SSE batching - queue events and flush once per frame
  const queueRef = useRef<StreamEvent[]>([]);
  const rafRef = useRef<number | null>(null);

  const resync = (pid: string, sid: string) => {
    http
      .get(`api/agent/${pid}/session/${sid}/message`, {
        retry: { limit: 5, statusCodes: [502, 503, 504], delay: () => 1000 },
      })
      .json<Array<{ info: Message; parts: Part[] }>>()
      .then((items) => dispatch({ type: "batch.load", properties: { messages: items ?? [] } } as any))
      .catch(() => dispatch({ type: "batch.load", properties: { messages: [] } } as any));
    http
      .get(`api/agent/${pid}/session/status`)
      .json<Record<string, unknown>>()
      .then((items) => {
        const status = items?.[sid];
        if (status) dispatch({ type: "session.status", properties: { sessionID: sid, status } } as any);
      })
      .catch(() => {});
  };

  // Clear state and resync on session change
  useEffect(() => {
    if (!projectId || !sessionId) return;
    if (currentSessionRef.current !== sessionId) {
      dispatch({ type: "session.deleted" } as any);
      currentSessionRef.current = sessionId;
      resync(projectId, sessionId);
    }
  }, [projectId, sessionId]);

  // Subscribe to SSE events
  useEffect(() => {
    if (!projectId) return;
    closedRef.current = false;
    const url = backendBaseUrl ? `${backendBaseUrl}/api/agent/${projectId}/event` : `/api/agent/${projectId}/event`;

    const connect = () => {
      if (closedRef.current) return;
      esRef.current?.close();
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;
      es.onopen = () => {
        dispatch({ type: "server.connected" });
        const sid = sessionIdRef.current;
        if (sid) resync(projectId, sid);
      };
      es.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data);
          // Handle compaction: resync immediately
          const sid = sessionIdRef.current;
          if (event.type === "session.compacted" && sid && event.properties?.sessionID === sid) {
            resync(projectId, sid);
          }
          queueRef.current.push(event);
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              const events = queueRef.current;
              queueRef.current = [];
              rafRef.current = null;
              events.forEach(e => dispatch(e));
            });
          }
        } catch {}
      };
      es.onerror = () => {
        dispatch({ type: "connection.closed" });
        es.close();
        if (!closedRef.current) setTimeout(connect, 1000);
      };
    };
    connect();
    return () => {
      closedRef.current = true;
      dispatch({ type: "connection.closed" });
      esRef.current?.close();
    };
  }, [projectId]);

  const dismissError = () => dispatch({ type: "error.clear" } as any);

  return { ...state, dismissError };
}
