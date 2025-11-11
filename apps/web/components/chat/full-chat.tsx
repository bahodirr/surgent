'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatMessage } from '@/components/chat/chat-message';
import { Button } from '@/components/ui/button';
import { StopCircle } from 'lucide-react';

type FullChatProps = {
  initialPrompt?: string;
};

export default function FullChat({ initialPrompt }: FullChatProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const hasSeededRef = useRef(false);
  
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  // Seed initial prompt once if provided
  useEffect(() => {
    if (!hasSeededRef.current && initialPrompt && initialPrompt.trim()) {
      hasSeededRef.current = true;
      sendMessage({ text: initialPrompt.trim() });
    }
    // We intentionally exclude sendMessage from deps; it's stable from the hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSend = (text: string, files?: FileList) => {
    if (isLoading) return;
    sendMessage({ text, files });
  };

  const placeholder = useMemo(
    () => (isLoading ? 'Assistant is thinking…' : 'Type a message…'),
    [isLoading]
  );

  return (
    <div className="h-screen w-full bg-background flex flex-col pl-1 pr-1">
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="w-full mx-auto min-h-full flex flex-col px-4 sm:px-6 lg:px-16 max-w-4xl">
          <div className="flex flex-col gap-4 p-4">
            <div className="px-1 sm:px-0 py-4 space-y-3 pr-8">
              {messages.length === 0 ? (
                <div className="text-center text-sm text-foreground/50 py-24">
                  Start a conversation.
                </div>
              ) : (
                messages.filter(m => m.role !== 'system').map((m) => (
                  <ChatMessage key={m.id} role={m.role as 'user' | 'assistant'} parts={m.parts} />
                ))
              )}
              <div ref={bottomRef} className="h-px" />
            </div>

            {error && (
              <div className="py-2 px-4 bg-destructive/10 text-destructive rounded-lg text-sm">
                <span>An error occurred. Please try again.</span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Fixed stop button above composer */}
      {isLoading && (
        <div className="w-full">
          <div className="w-full mx-auto px-4 sm:px-6 lg:px-16 pt-2 max-w-4xl">
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={stop}
                className="gap-2"
              >
                <StopCircle className="h-4 w-4" />
                Stop generating
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Composer (fixed position at bottom area) */}
      <div className="w-full">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-16 py-4 max-w-4xl">
          <ChatComposer
            onSend={handleSend}
            disabled={isLoading || error !== undefined}
            placeholder={placeholder}
          />
        </div>
      </div>
    </div>
  );
}


