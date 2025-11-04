"use client";

import { useEffect, useReducer, useRef } from "react";
import type { Event, Message, Part, Session } from "@opencode-ai/sdk";
import { backendBaseUrl } from "@/lib/http";

type State = {
  messages: Message[];
  parts: Record<string, Part[]>;
  session?: Session;
  lastAt: number;
};

type StreamEvent = Event | { type: string; properties?: Record<string, any> };

const initialState: State = { messages: [], parts: {}, lastAt: 0 };

function upsertMessage(list: Message[], incoming: Message): Message[] {
  const idx = list.findIndex((m) => m.id === incoming.id);
  if (idx === -1) return [...list, incoming];
  const merged = { ...list[idx], ...incoming } as Message;
  return [...list.slice(0, idx), merged, ...list.slice(idx + 1)];
}

function upsertPart(list: Part[] | undefined, incoming: Part): Part[] {
  if (!list) return [incoming];
  const idx = list.findIndex((p) => p.id === incoming.id);
  if (idx === -1) return [...list, incoming];
  const merged = { ...list[idx], ...incoming } as Part;
  return [...list.slice(0, idx), merged, ...list.slice(idx + 1)];
}

function reducer(state: State, event: StreamEvent, currentSessionId?: string): State {
  const props = (event as any).properties;
  const now = Date.now();
  
  if (!props) {
    return event.type === "session.deleted" 
      ? { ...state, session: undefined, messages: [], parts: {}, lastAt: now }
      : { ...state, lastAt: now };
  }
  
  switch (event.type) {
    case "session.updated": {
      const info = props.info as Session;
      if (info.id !== currentSessionId) return state;
      return { ...state, session: info, lastAt: now };
    }
    case "session.deleted": {
      if (props.sessionID !== currentSessionId) return state;
      return { ...state, session: undefined, messages: [], parts: {}, lastAt: now };
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
      return { ...state, parts: { ...state.parts, [part.messageID]: upsertPart(state.parts[part.messageID], part) }, lastAt: now };
    }
    case "message.part.removed": {
      const parts = { ...state.parts };
      const filtered = parts[props.messageID]?.filter((p) => p.id !== props.partID);
      if (filtered) parts[props.messageID] = filtered;
      else delete parts[props.messageID];
      return { ...state, parts, lastAt: now };
    }
    default:
      return { ...state, lastAt: now };
  }
}

export default function useAgentStream({ projectId, sessionId }: { projectId?: string; sessionId?: string }) {
  const [state, dispatch] = useReducer((state: State, event: StreamEvent) => reducer(state, event, sessionId), initialState);
  const esRef = useRef<EventSource | null>(null);
  const closedRef = useRef(false);
  const currentSessionRef = useRef(sessionId);

  // Load initial messages
  useEffect(() => {
    if (!projectId || !sessionId) return;
    
    if (currentSessionRef.current !== sessionId) {
      dispatch({ type: "session.deleted" } as any);
      currentSessionRef.current = sessionId;
    }

    const controller = new AbortController();
    const url = backendBaseUrl
      ? `${backendBaseUrl}/api/agent/${projectId}/session/${sessionId}/message`
      : `/api/agent/${projectId}/session/${sessionId}/message`;

    fetch(url, { credentials: "include", signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then((items: Array<{ info: Message; parts: Part[] }> | null) => {
        items?.forEach(({ info, parts }) => {
          dispatch({ type: "message.updated", properties: { info } } as any);
          parts.forEach(part => dispatch({ type: "message.part.updated", properties: { part } } as any));
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      });

    return () => controller.abort();
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
      es.onmessage = (evt) => {
        try {
          dispatch(JSON.parse(evt.data));
        } catch {}
      };
      es.onerror = () => {
        es.close();
        if (!closedRef.current) setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closedRef.current = true;
      esRef.current?.close();
    };
  }, [projectId]);

  return state;
}
