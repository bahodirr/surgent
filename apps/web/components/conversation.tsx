'use client';

import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowUp } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    sessionId?: string;
    durationMs?: number;
    isError?: boolean;
  };
}

interface InitStatus {
  state: 'initializing' | 'ready' | 'error';
  message: string;
}

interface ConversationProps {
  disabled?: boolean;
  initStatus?: InitStatus | null;
  projectId?: string;
}

export default function Conversation({ disabled = false, initStatus = null, projectId }: ConversationProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m here to help you with your development tasks. What would you like to work on today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '56px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [input]);

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const resetConversation = () => {
    // Close any active stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsLoading(false);
    setSessionId(undefined);
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: 'Hello! I\'m here to help you with your development tasks. What would you like to work on today?',
        timestamp: new Date(),
      },
    ]);
  };

  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsLoading(false);
  };

  // Lightweight SSE client for backend /api/chat/stream using named events: 'update', 'complete', 'error'
  const openChatStream = (
    prompt: string,
    callbacks: {
      onUpdate?: (chunk: string) => void;
      onComplete?: (payload: { success?: boolean; sessionId?: string; metadata?: { duration?: number } }) => void;
      onError?: (error: string) => void;
    },
    options?: { sessionId?: string; projectId?: string; mode?: 'ask' | 'code' }
  ): EventSource => {
    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    const params = new URLSearchParams({ prompt });
    if (options?.projectId) params.append('projectId', options.projectId);
    if (options?.sessionId) params.append('sessionId', options.sessionId);
    if (options?.mode) params.append('mode', options.mode);

    const es = new EventSource(`${baseUrl}/api/chat/stream?${params.toString()}` as string, { withCredentials: true });

    es.addEventListener('update', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        callbacks.onUpdate?.(String(data?.chunk ?? ''));
      } catch {
        callbacks.onUpdate?.('');
      }
    });

    es.addEventListener('complete', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        callbacks.onComplete?.({
          success: data?.success,
          sessionId: data?.sessionId,
          metadata: data?.metadata,
        });
      } catch {
        callbacks.onComplete?.({});
      } finally {
        es.close();
      }
    });

    es.addEventListener('error', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        callbacks.onError?.(String(data?.error || 'Unknown error'));
      } catch {
        callbacks.onError?.('Connection error');
      } finally {
        es.close();
      }
    });

    es.onerror = () => {
      callbacks.onError?.('Connection error');
      es.close();
    };

    return es;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Stream via backend chat endpoint using SSE with credentials
      eventSourceRef.current = openChatStream(
        userMessage.content,
        {
          onUpdate: (chunk: string) => {
            // Each update is its own message. Chunk may itself be JSON-encoded string.
            let content = '';
            let role: 'system' | 'assistant' = 'system';
            try {
              const parsed = JSON.parse(chunk);
              // If it's an assistant event with text, render the assistant text; otherwise render the pretty JSON
              if (parsed?.type === 'assistant' && parsed?.message?.content) {
                const text = Array.isArray(parsed.message.content)
                  ? parsed.message.content.filter((b: any) => b?.type === 'text').map((b: any) => String(b?.text || '')).join('')
                  : '';
                content = text || JSON.stringify(parsed);
                role = 'assistant';
              } else {
                content = `[update] ${parsed?.type || 'event'}${parsed?.subtype ? `:${parsed.subtype}` : ''}\n` + JSON.stringify(parsed, null, 2);
              }
            } catch {
              content = `[update] raw\n${chunk}`;
            }
            const eventMessage: Message = {
              id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
              role,
              content,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, eventMessage]);
          },
          onComplete: (payload) => {
            if (payload?.sessionId) setSessionId(payload.sessionId);
            const completeMsg: Message = {
              id: 'complete-' + Date.now(),
              role: 'system',
              content: `[complete] success=${String(payload?.success ?? '')}${payload?.metadata?.duration ? ` • duration=${payload.metadata.duration}ms` : ''}`,
              timestamp: new Date(),
              metadata: { sessionId: payload?.sessionId, durationMs: payload?.metadata?.duration },
            };
            setMessages(prev => [...prev, completeMsg]);
            stopStreaming();
          },
          onError: (error: string) => {
            const errorMsg: Message = {
              id: 'error-' + Date.now(),
              role: 'system',
              content: `Error: ${error}`,
              timestamp: new Date(),
              metadata: { isError: true },
            };
            setMessages(prev => [...prev, errorMsg]);
            stopStreaming();
          },
        },
        { sessionId, projectId, mode: 'ask' }
      );
    } catch (error: any) {
      console.error('Claude API error:', error);
      const errorMsg: Message = {
        id: 'error-' + Date.now(),
        role: 'system',
        content: `Error: ${error.message}`,
        timestamp: new Date(),
        metadata: { isError: true },
      };
      setMessages(prev => [...prev, errorMsg]);
      stopStreaming();
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      {initStatus && (
        <div className={`px-4 py-2 border-b ${initStatus.state === 'error' ? 'bg-destructive/10 border-destructive/50 text-destructive' : 'bg-muted/30'}`}>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {initStatus.state === 'initializing' && (
                <span className="inline-flex h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              )}
              <span>{initStatus.message}</span>
            </div>
          </div>
        </div>
      )}
      <div className="px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-500' : 'bg-green-500'}`} />
              {isLoading ? 'Streaming' : 'Ready'}
            </span>
            {sessionId && <span>Session: {sessionId}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetConversation}
              className="text-muted-foreground hover:underline"
            >
              New
            </button>
          </div>
        </div>
      </div>
      
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : message.role === 'system' ? 'justify-center' : 'justify-start'
              }`}
            >
              <div className={`max-w-[75%] ${
                message.role === 'user' ? 'ml-12' : message.role === 'system' ? '' : 'mr-12'
              }`}>
                <div className="flex flex-col gap-1">
                  <div
                    className={`rounded-2xl px-4 py-3 border ${
                      message.role === 'user'
                        ? 'bg-muted/50 border-muted/50 ml-auto'
                        : message.role === 'system'
                        ? 'bg-muted/30 border-muted/30 text-xs'
                        : 'bg-background border-border/50'
                    }`}
                  >
                    <p className={`${message.role === 'system' ? 'text-xs' : 'text-sm'} leading-relaxed`}>
                      {message.content}
                    </p>
                  </div>
                  <div className={`flex items-center gap-2 text-xs text-muted-foreground px-2 ${
                    message.role === 'user' ? 'justify-end' : message.role === 'system' ? 'justify-center' : 'justify-start'
                  }`}>
                    <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {message.metadata?.durationMs && (
                      <span>• {(message.metadata.durationMs / 1000).toFixed(1)}s</span>
                    )}
                    {message.metadata?.isError && (
                      <span className="text-red-500">• Error</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      
      <div className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative rounded-3xl border bg-muted/30 p-3"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={disabled ? 'Initializing project environment...' : 'Ask anything...'}
            disabled={disabled}
            className="w-full resize-none bg-transparent px-2 pb-8 pt-2 text-sm placeholder:text-muted-foreground focus:outline-none min-h-[56px] max-h-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ lineHeight: '1.5' }}
          rows={2}
          />
          
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-end gap-2">
            {isLoading && (
              <button
                type="button"
                onClick={stopStreaming}
                className="px-2 h-8 rounded-full text-xs border hover:bg-muted transition-colors"
                aria-label="Stop streaming"
              >
                Stop
              </button>
            )}
            <button
              type="submit"
              disabled={disabled || !input.trim() || isLoading}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity cursor-pointer"
              aria-label="Send message"
            >
              {isLoading ? (
                <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}