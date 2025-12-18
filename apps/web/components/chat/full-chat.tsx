'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const prefilledRef = useRef(false);
  const [inputValue, setInputValue] = useState('');
  
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  // Prefill input with initial prompt (don't auto-send)
  useEffect(() => {
    if (!prefilledRef.current && initialPrompt?.trim() && !inputValue) {
      prefilledRef.current = true;
      setInputValue(initialPrompt.trim());
    }
  }, [initialPrompt, inputValue]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSend = (text: string, files?: FileList) => {
    if (isLoading) return;
    sendMessage({ text, files });
    setInputValue('');
  };

  const placeholder = useMemo(
    () => (isLoading ? 'Assistant is thinking…' : 'Type a message…'),
    [isLoading]
  );

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <ScrollArea className="flex-1 overflow-x-hidden">
        <div className="w-full mx-auto min-h-full flex flex-col px-2 sm:px-4 md:px-6 lg:px-16 max-w-4xl">
          <div className="flex flex-col gap-3 sm:gap-4 p-2 sm:p-4">
            <div className="py-3 sm:py-4 space-y-2 sm:space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-xs sm:text-sm text-foreground/50 py-16 sm:py-24">
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
              <div className="py-2 px-3 sm:px-4 bg-destructive/10 text-destructive rounded-lg text-xs sm:text-sm">
                <span>An error occurred. Please try again.</span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Fixed stop button above composer */}
      {isLoading && (
        <div className="w-full">
          <div className="w-full mx-auto px-2 sm:px-4 md:px-6 lg:px-16 pt-2 max-w-4xl">
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={stop}
                className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
              >
                <StopCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Stop generating</span>
                <span className="sm:hidden">Stop</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Composer (fixed position at bottom area) */}
      <div className="w-full">
        <div className="w-full mx-auto px-2 sm:px-4 md:px-6 lg:px-16 py-2 sm:py-4 max-w-4xl">
          <ChatComposer
            onSend={handleSend}
            disabled={isLoading || error !== undefined}
            placeholder={placeholder}
            value={inputValue}
            onValueChange={setInputValue}
          />
        </div>
      </div>
    </div>
  );
}


