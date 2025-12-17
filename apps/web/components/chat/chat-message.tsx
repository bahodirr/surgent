'use client';

import { cn } from '@/lib/utils';
import type { UIMessagePart, UIDataTypes, UITools } from 'ai';
import { ToolCallDisplay } from './tool-call-display';
import { ShimmeringText } from '@/components/ui/shimmer-text';
import {
  Message,
  MessageContent,
} from '@/components/ui/message';

type ChatMessageProps = {
  role: 'user' | 'assistant';
  parts: UIMessagePart<UIDataTypes, UITools>[];
};

export function ChatMessage({ role, parts }: ChatMessageProps) {
  return (
    <Message
      className={cn('items-start w-full', role === 'user' ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('flex w-full min-w-0 flex-col gap-1.5 sm:gap-2', role === 'user' ? 'w-fit max-w-[90%] sm:max-w-[80%] md:max-w-[70%]' : 'w-full')}>
        {parts.map((part, index) => {
          if (part.type === 'text' && 'text' in part) {
            return (
              <MessageContent
                key={index}
                markdown
                className={cn(
                  'prose prose-sm dark:prose-invert max-w-none wrap-break-word [&_pre]:overflow-x-auto [&_p]:text-[13px] [&_p]:sm:text-sm [&_li]:text-[13px] [&_li]:sm:text-sm',
                  role === 'assistant'
                    ? 'bg-white w-full'
                    : 'bg-foreground/4 border border-border text-[13px] sm:text-sm'
                )}
              >
                {(part as { text: string }).text}
              </MessageContent>
            );
          }

          if (part.type === 'reasoning') {
            const isStreaming = 'state' in part && part.state === 'streaming';
            return (
              <div key={index} className="my-1 w-fit">
                {isStreaming ? (
                  <ShimmeringText
                    text="thinking…"
                    duration={1}
                    className="text-xs text-foreground/60"
                  />
                ) : (
                  <div className="text-xs text-foreground/60">thinking completed</div>
                )}
              </div>
            );
          }

          if (part.type.startsWith('tool-')) {
            const toolName = part.type.replace('tool-', '');
            if ('state' in part && 'input' in part) {
              return (
                <ToolCallDisplay
                  key={index}
                  toolName={toolName}
                  state={part.state}
                  input={part.input as Record<string, unknown>}
                  output={'output' in part ? part.output : undefined}
                />
              );
            }
          }

          return null;
        })}
      </div>
    </Message>
  );
}


