'use client';

import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowUp, Plus } from 'lucide-react';
import { ClaudeClient, SDKMessage } from '@/lib/claude-client';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    sessionId?: string;
    model?: string;
    tools?: string[];
    cost?: number;
    duration?: number;
    isError?: boolean;
    numTurns?: number;
    apiKeySource?: string;
    permissionMode?: string;
    inputTokens?: number;
    outputTokens?: number;
    stopReason?: string;
  };
}

export default function Conversation() {
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
  const [claudeInfo, setClaudeInfo] = useState<SDKMessage & { type: 'system' } | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const claudeClient = useRef(new ClaudeClient()).current;

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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
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

    // Create assistant message placeholder
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      // Use streaming with Daytona
      let accumulatedContent = '';
      
      eventSourceRef.current = claudeClient.streamPrompt(
        userMessage.content,
        {
          onMessage: (message) => {
            console.log('SDK Message:', message);
          },
          onInit: (message) => {
            console.log('Claude init:', message);
            setClaudeInfo(message);
            setIsInitialized(true);
            
            if (message.session_id) {
              setSessionId(message.session_id);
            }
            
            // Add system message about initialization
            if (!isInitialized) {
              const initMessage: Message = {
                id: 'init-' + Date.now(),
                role: 'system',
                content: `Claude initialized • Model: ${message.model} • Tools: ${message.tools?.length || 0} available • Mode: ${message.permissionMode}`,
                timestamp: new Date(),
                metadata: {
                  sessionId: message.session_id,
                  model: message.model,
                  tools: message.tools,
                  apiKeySource: message.apiKeySource,
                  permissionMode: message.permissionMode
                }
              };
              setMessages(prev => [...prev.slice(0, -1), initMessage, prev[prev.length - 1]]);
            }
          },
          onAssistant: (content, message) => {
            accumulatedContent += content;
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessage.id
                  ? { 
                      ...msg, 
                      content: accumulatedContent,
                      metadata: {
                        ...msg.metadata,
                        model: message.message.model,
                        inputTokens: message.message.usage.input_tokens,
                        outputTokens: message.message.usage.output_tokens,
                        stopReason: message.message.stop_reason || undefined
                      }
                    }
                  : msg
              )
            );
          },
          onUser: (message) => {
            console.log('User message:', message);
          },
          onResult: (message) => {
            console.log('Claude result:', message);
            
            // Update the assistant message with final metadata
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessage.id
                  ? { 
                      ...msg, 
                      content: message.type === 'result' && message.subtype === 'success' && message.result ? message.result : msg.content,
                      metadata: {
                        ...msg.metadata,
                        sessionId: message.session_id,
                        cost: message.total_cost_usd,
                        duration: message.duration_ms,
                        isError: message.is_error,
                        numTurns: message.num_turns
                      }
                    }
                  : msg
              )
            );
            
            // Add error message if needed
            if (message.is_error && message.subtype !== 'success') {
              const errorMessage: Message = {
                id: 'error-' + Date.now(),
                role: 'system',
                content: `Error: ${message.subtype === 'error_max_turns' ? 'Maximum turns reached' : 'Error during execution'}`,
                timestamp: new Date(),
                metadata: {
                  isError: true,
                  numTurns: message.num_turns
                }
              };
              setMessages(prev => [...prev, errorMessage]);
            }
          },
          onError: (error) => {
            console.error('Claude streaming error:', error);
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: msg.content || `Error: ${error}` }
                  : msg
              )
            );
            setIsLoading(false);
          },
          onComplete: () => {
            setIsLoading(false);
            accumulatedContent = '';
          },
        },
        { sessionId }
      );
    } catch (error: any) {
      console.error('Claude API error:', error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessage.id
            ? { ...msg, content: `Error: ${error.message}` }
            : msg
        )
      );
      setIsLoading(false);
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Handle file upload logic here
      console.log('Files selected:', files);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Status bar */}
      {claudeInfo && (
        <div className="px-4 py-2 border-b bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${isInitialized ? 'bg-green-500' : 'bg-yellow-500'}`} />
                {isInitialized ? 'Connected' : 'Connecting'}
              </span>
              <span>Session: {sessionId?.slice(0, 8) || 'none'}</span>
              <span>Model: {claudeInfo.model}</span>
              <span>Tools: {claudeInfo.tools?.length || 0}</span>
            </div>
          </div>
        </div>
      )}
      
      <ScrollArea className="flex-1">
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
                    {message.metadata?.model && message.role === 'assistant' && (
                      <span>• {message.metadata.model}</span>
                    )}
                    {message.metadata?.inputTokens && message.metadata?.outputTokens && (
                      <span>• {message.metadata.inputTokens + message.metadata.outputTokens} tokens</span>
                    )}
                    {message.metadata?.cost && (
                      <span>• ${message.metadata.cost.toFixed(4)}</span>
                    )}
                    {message.metadata?.duration && (
                      <span>• {(message.metadata.duration / 1000).toFixed(1)}s</span>
                    )}
                    {message.metadata?.stopReason && (
                      <span>• {message.metadata.stopReason}</span>
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
            placeholder="Ask anything..."
            className="w-full resize-none bg-transparent px-2 pb-8 pt-2 text-sm placeholder:text-muted-foreground focus:outline-none min-h-[56px] max-h-[120px]"
            style={{ lineHeight: '1.5' }}
          rows={2}
          />
          
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <button
              type="button"
              onClick={handleFileClick}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors cursor-pointer"
              aria-label="Add attachments"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
            </button>
            
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
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
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
        </form>
      </div>
    </div>
  );
}