'use client';

import { FileText, FileEdit, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        'my-2 p-3 rounded-lg border bg-muted/50 border-border'
      )}>
        <div className="flex items-center gap-2 text-sm font-medium">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-foreground/60" />}
          {isComplete && <FileText className="h-4 w-4 text-foreground/60" />}
          <span className="text-foreground/70">{isLoading ? 'Opening PLAN.md…' : 'Opened PLAN.md'}</span>
        </div>
        {isComplete && planOutput && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-foreground/60">Preview content</summary>
            <div className="mt-1 p-2 bg-white rounded border border-border/60 font-mono max-h-48 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-foreground/70">
                {String(planOutput.content || '(empty)')}
              </pre>
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
        'my-2 p-3 rounded-lg border bg-muted/50 border-border'
      )}>
        <div className="flex items-center gap-2 text-sm font-medium">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-foreground/60" />}
          {isComplete && result?.success && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          {isError && <FileEdit className="h-4 w-4 text-red-600" />}
          <span className="text-foreground/70">
            {mode === 'append' ? 'Added to PLAN.md' : 'Updated PLAN.md'}
            {sectionTitle && ` · ${sectionTitle}`}
          </span>
        </div>

        {content && mode === 'append' && (
          <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/40">
            <div className="px-2 py-1 text-[11px] text-emerald-700 font-medium">Appended content</div>
            <div className="px-2 pb-2">
              <pre className="text-xs whitespace-pre-wrap text-foreground/80">
                {content.split('\n').map((line, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <Plus className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
                    <span className="font-mono">{line}</span>
                  </div>
                ))}
              </pre>
            </div>
          </div>
        )}

        {content && mode === 'replace' && (
          <div className="mt-2 rounded border border-blue-200 bg-blue-50/40">
            <div className="px-2 py-1 text-[11px] text-blue-700 font-medium">
              {sectionTitle ? `New content for “${sectionTitle}”` : 'New content'}
            </div>
            <div className="px-2 pb-2">
              <pre className="text-xs whitespace-pre-wrap text-foreground/80 font-mono max-h-48 overflow-y-auto">
                {content}
              </pre>
            </div>
          </div>
        )}

        {isComplete && result?.message && (
          <div className="mt-2 text-xs text-green-600 font-medium">
            ✓ {result.message}
          </div>
        )}
      </div>
    );
  }

  // Generic tool call fallback
  return (
    <div className="my-2 p-3 rounded-lg border bg-muted/50 border-border">
      <div className="flex items-center gap-2 text-sm font-medium">
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {isComplete && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        <span className="text-foreground/80">Tool: {toolName}</span>
      </div>
      {Boolean(input) && Object.keys(input as Record<string, unknown>).length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-foreground/60">Input</summary>
          <pre className="mt-1 p-2 bg-white rounded overflow-x-auto">
            {JSON.stringify(input as Record<string, unknown>, null, 2)}
          </pre>
        </details>
      )}
      {isComplete && output != null && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-foreground/60">Output</summary>
          <pre className="mt-1 p-2 bg-white rounded overflow-x-auto">
            {JSON.stringify(output as unknown, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

