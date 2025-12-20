'use client';

import { FileText, FileEdit, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock, CodeBlockCode } from '@/components/ui/code-block';

type ToolCallDisplayProps = {
  toolName: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: Record<string, unknown>;
  output?: unknown;
};

export function ToolCallDisplay({ toolName, state, input, output }: ToolCallDisplayProps) {
  const isLoading = state === 'input-streaming' || state === 'input-available';
  const isComplete = state === 'output-available';
  const isError = state === 'output-error';
  const planOutput =
    output && typeof output === 'object' && 'content' in (output as Record<string, unknown>)
      ? (output as { content: string })
      : null;

  // Render based on tool type
  if (toolName === 'readPlan') {
    return (
      <div className={cn(
        'my-1.5 sm:my-2 p-2 sm:p-3 rounded-lg border bg-muted/50 border-border'
      )}>
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
          {isLoading && <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-foreground/60" />}
          {isComplete && <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground/60" />}
          <span className="text-foreground/70 truncate">{isLoading ? 'Opening PLAN.md…' : 'Opened PLAN.md'}</span>
        </div>
        {isComplete && planOutput && (
          <details className="mt-1.5 sm:mt-2 text-xs">
            <summary className="cursor-pointer text-foreground/60">Preview content</summary>
            <div className="mt-1 max-h-32 sm:max-h-48 overflow-hidden">
              <CodeBlock className="border-border/60">
                <CodeBlockCode
                  code={String(planOutput.content || '(empty)')}
                  language="md"
                  className="max-h-32 sm:max-h-48 overflow-y-auto"
                />
              </CodeBlock>
            </div>
          </details>
        )}
      </div>
    );
  }

  if (toolName === 'updatePlan') {
    const mode = input?.mode as string;
    const sectionTitle = input?.sectionTitle as string;
    const content = input?.content as string;
    const result = output as { success?: boolean; message?: string } | undefined;

    return (
      <div className={cn(
        'my-1.5 sm:my-2 p-2 sm:p-3 rounded-lg border bg-muted/50 border-border'
      )}>
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
          {isLoading && <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-foreground/60" />}
          {isComplete && result?.success && <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />}
          {isError && <FileEdit className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-danger" />}
          <span className="text-foreground/70 truncate">
            {mode === 'append' ? 'Added to PLAN.md' : 'Updated PLAN.md'}
            {sectionTitle && ` · ${sectionTitle}`}
          </span>
        </div>

        {content && mode === 'append' && (
          <div className="mt-1.5 sm:mt-2 rounded border border-border bg-muted/40">
            <div className="px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] text-muted-foreground font-medium">Appended content</div>
            <div className="px-1.5 sm:px-2 pb-1.5 sm:pb-2">
              <pre className="text-[10px] sm:text-xs whitespace-pre-wrap text-foreground/80 overflow-x-auto">
                {content.split('\n').map((line, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-success mt-0.5 shrink-0" />
                    <span className="font-mono break-words">{line}</span>
                  </div>
                ))}
              </pre>
            </div>
          </div>
        )}

        {content && mode === 'replace' && (
          <div className="mt-1.5 sm:mt-2 rounded border border-border bg-muted/40">
            <div className="px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] text-muted-foreground font-medium truncate">
              {sectionTitle ? `New content for "${sectionTitle}"` : 'New content'}
            </div>
            <div className="px-1.5 sm:px-2 pb-1.5 sm:pb-2">
              <pre className="text-[10px] sm:text-xs whitespace-pre-wrap text-foreground/80 font-mono max-h-32 sm:max-h-48 overflow-y-auto overflow-x-auto">
                {content}
              </pre>
            </div>
          </div>
        )}

        {isComplete && result?.message && (
          <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-success font-medium">
            ✓ {result.message}
          </div>
        )}
      </div>
    );
  }

  // Generic tool call fallback
  return (
    <div className="my-1.5 sm:my-2 p-2 sm:p-3 rounded-lg border bg-muted/50 border-border">
      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
        {isLoading && <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />}
        {isComplete && <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />}
        <span className="text-foreground/80 truncate">Tool: {toolName}</span>
      </div>
      {Boolean(input) && Object.keys(input as Record<string, unknown>).length > 0 && (
        <details className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs">
          <summary className="cursor-pointer text-foreground/60">Input</summary>
          <pre className="mt-1 p-1.5 sm:p-2 bg-card text-card-foreground border border-border rounded overflow-x-auto text-[10px] sm:text-xs">
            {JSON.stringify(input as Record<string, unknown>, null, 2)}
          </pre>
        </details>
      )}
      {isComplete && output != null && (
        <details className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs">
          <summary className="cursor-pointer text-foreground/60">Output</summary>
          <pre className="mt-1 p-1.5 sm:p-2 bg-card text-card-foreground border border-border rounded overflow-x-auto text-[10px] sm:text-xs">
            {JSON.stringify(output as unknown, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

