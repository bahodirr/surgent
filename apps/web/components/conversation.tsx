'use client';

import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, ChevronDown, PlayCircle, AlertCircle, GitCommit } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface InitStatus {
  state: 'initializing' | 'ready' | 'error';
  message: string;
}

interface ConversationProps {
  initStatus?: InitStatus | null;
  timeline?: any[];
  todos?: any[];
  onClose?: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  composer?: React.ReactNode;
}

export default function Conversation({ initStatus = null, timeline, todos, isOpen, composer }: ConversationProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [todosCollapsed, setTodosCollapsed] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openToolItems, setOpenToolItems] = useState<Record<string, boolean>>({});

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [timeline?.length]);

  const stringify = (value: any) => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  };
  
  // Produce a short, intuitive hint (e.g., file name or key arg) from tool input
  const getToolHint = (input: any): string | undefined => {
    if (!input) return undefined;
    const toBasename = (str: string) => {
      if (!str) return str;
      try {
        // Handle URLs
        if (/^https?:\/\//i.test(str)) {
          const url = new URL(str);
          const pathname = url.pathname || '';
          const segs = pathname.split('/').filter(Boolean);
          return segs[segs.length - 1] || url.hostname;
        }
      } catch {}
      const normalized = String(str).replace(/\n/g, ' ').trim();
      const parts = normalized.split(/[\\/]/);
      const base = parts[parts.length - 1] || normalized;
      return base;
    };
    const shorten = (str: string, max = 40) => {
      if (str.length <= max) return str;
      return str.slice(0, max - 1) + '…';
    };
    const fromString = (str: string) => {
      const singleLine = str.replace(/\n/g, ' ').trim();
      const base = toBasename(singleLine);
      return shorten(base);
    };
    const fromObject = (obj: any) => {
      const candidates = [
        obj?.target_file,
        obj?.file,
        obj?.path,
        Array.isArray(obj?.paths) ? obj.paths[0] : undefined,
        obj?.target_notebook,
        obj?.command,
        obj?.query,
        obj?.pullNumberOrCommitHash,
        obj?.search_term,
        obj?.title,
      ].filter(Boolean) as string[];
      if (!candidates.length) return undefined;
      return fromString(String(candidates[0]));
    };
    if (typeof input === 'string') return fromString(input);
    if (typeof input === 'object') return fromObject(input);
    return undefined;
  };
  
  // timeline is provided by parent

  // Shared classes for large blocks to avoid layout overflow
  const preClamp = "bg-gray-100 p-2 rounded text-[10px] font-mono overflow-auto max-h-48 whitespace-pre-wrap break-words break-all";

  if (!isOpen) return null;

  return (
    <div className={cn(
      "min-h-0 flex flex-col bg-background overflow-hidden rounded-none w-full h-full"
    )}>

      <ScrollArea
        className={cn(
          "flex-1 min-h-0",
          // Slimmer, borderless scrollbar only within Conversation
          "[&_[data-slot='scroll-area-scrollbar']]:w-1.5",
          "[&_[data-slot='scroll-area-scrollbar']]:border-0",
          "[&_[data-slot='scroll-area-scrollbar'][data-orientation='horizontal']]:h-1.5"
        )}
      >
        <div className="p-2 space-y-2">
            {timeline?.length === 0 && (
              <div className="text-xs text-muted-foreground">No messages yet. Ask something to get started.</div>
            )}
            {timeline?.map((entry: any, idx: number) => {
            if (entry.kind === 'toolGroup') {
              const items = entry.items as any[];
              const ts = items[0]?._creationTime ? new Date(items[0]._creationTime) : undefined;
              const key = `tool-group-${idx}-${items.length}`;
              // default open tool groups
              const isOpen = openGroups[key] ?? true;
              return (
                <div key={key} className="flex justify-start">
                  <div className="max-w-full p-2 rounded border bg-background w-full">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between text-left"
                      onClick={() => setOpenGroups((s) => ({ ...s, [key]: !(s[key] ?? true) }))}
                      aria-expanded={isOpen}
                    >
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span className={`inline-flex h-3 w-3 border-2 border-current border-t-transparent rounded-full ${items.some((mm:any)=>!mm.tool?.result && mm.tool?.status!=='error') ? 'animate-spin' : ''}`} />
                        <span className="font-medium text-foreground">{items.length} tool{items.length > 1 ? 's' : ''}</span>
                        {ts && <span>• {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                      <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </button>

                    {isOpen && (
                      <div className="mt-2 space-y-1">
                        {items.map((mm, j) => {
                          const status = mm.tool?.status as string | undefined;
                          const label = status === 'error' ? 'error' : mm.tool?.result ? 'completed' : mm.tool?.input ? 'running' : 'processing';
                          const itemKey = `${key}-${j}`;
                          const itemOpen = openToolItems[itemKey] ?? false; // default closed
                          const hint = getToolHint(mm.tool?.input);
                          return (
                            <div key={`tool-${idx}-${j}`} className="rounded border bg-white/60">
                              <button
                                type="button"
                                className="w-full flex items-center justify-between px-2 py-1 text-xs"
                                onClick={() => setOpenToolItems((s) => ({ ...s, [itemKey]: !(s[itemKey] ?? false) }))}
                                aria-expanded={itemOpen}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "h-2.5 w-2.5 rounded-full",
                                      label === 'completed' && "bg-green-500",
                                      label === 'error' && "bg-red-500",
                                      label !== 'completed' && label !== 'error' && "bg-yellow-500"
                                    )}
                                  />
                                  <span className="font-mono">{mm.tool?.name || 'tool'}</span>
                                  {hint && <span className="text-muted-foreground font-mono">({hint})</span>}
                                  <span className="text-muted-foreground">• {label}</span>
                                </div>
                                <ChevronDown size={12} className={cn("text-muted-foreground transition-transform", itemOpen && "rotate-180")} />
                              </button>
                              {itemOpen && (
                                <div className="px-2 pb-2 max-h-60 overflow-auto">
                                  {mm.tool?.input && (
                                    <div className="mt-1">
                                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">input</div>
                                      <pre className={preClamp}>
                                        {stringify(mm.tool.input)}
                                      </pre>
                                    </div>
                                  )}
                                  {mm.tool?.result && (
                                    <div className="mt-1">
                                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">result</div>
                                      <pre className={preClamp}>
                                        {stringify(mm.tool.result)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (entry.kind === 'systemInit' || entry.kind === 'systemResult') {
              const m = entry.msg;
              const ts = m?._creationTime ? new Date(m._creationTime) : undefined;
              const key = (m?._id as string) || `${idx}-${m?._creationTime || Date.now()}`;
              return (
                <div key={key} className="flex flex-col items-center my-2">
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-px bg-muted flex-1" />
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] text-muted-foreground bg-muted/30 border-muted/30">
                      {(() => {
                        const isInit = m?.type === 'init';
                        const isError = m?.type === 'error';
                        const isCompact = entry.kind === 'systemResult' && typeof (m as any)?.contentText === 'string' && /compacted/i.test((m as any).contentText as string);
                        const Icon = isInit ? PlayCircle : isError ? AlertCircle : Check;
                        const label = isInit ? 'Session started' : isError ? 'Conversation error' : isCompact ? 'Compacted' : 'Conversation completed';
                        return (
                          <>
                            <Icon className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground/80">{label}</span>
                            {ts && (
                              <span className="text-muted-foreground/70">• {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="h-px bg-muted flex-1" />
                  </div>
                  {entry.kind === 'systemResult' && typeof (m as any)?.contentText === 'string' && (m as any).contentText.trim() && (
                    <div className="mt-2 w-full max-w-[720px] rounded border bg-white/60 p-2">
                      {(() => {
                        const mm: any = m;
                        const isHook = !!mm?.event?.kind && mm.event.kind === 'hook';
                        const isCompact = isHook && mm?.event?.name === 'compact';
                        const tone = mm?.event?.status === 'error' ? 'text-red-600' : 'text-green-700';
                        return (
                          <div className="space-y-1">
                            {isHook && (
                              <div className={`inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-[10px] border ${isCompact ? 'bg-green-50 border-green-200' : 'bg-muted/30 border-muted/30'}`}>
                                <span className={`font-medium ${tone}`}>{mm.event.name}</span>
                                {typeof mm?.event?.status === 'string' && <span className="text-muted-foreground">• {mm.event.status}</span>}
                              </div>
                            )}
                            <div className="text-[11px] text-foreground/80 whitespace-pre-wrap break-words">
                              {mm.contentText}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {m?.type === 'result' && m?.raw && (
                    <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-2">
                      {(() => {
                        const usage = (m.raw?.usage || m.raw?.data?.usage || m.raw?.result?.usage) as any;
                        const inTok = usage?.input_tokens ?? usage?.input ?? usage?.prompt_tokens;
                        const outTok = usage?.output_tokens ?? usage?.output ?? usage?.completion_tokens;
                        const dur = m.raw?.duration_ms ?? m.raw?.data?.duration_ms ?? m.raw?.result?.duration_ms;
                        const turns = m.raw?.num_turns ?? m.raw?.data?.num_turns ?? m.raw?.result?.num_turns;
                        return (
                          <>
                            {(typeof inTok === 'number' || typeof outTok === 'number') && (
                              <span>tokens: {inTok ?? '-'} / {outTok ?? '-'}</span>
                            )}
                            {typeof dur === 'number' && <span>{Math.round(dur / 1000)}s</span>}
                            {typeof turns === 'number' && <span>{turns} turns</span>}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {entry.kind === 'systemResult' && entry.checkpoint && (
                    <div className="mt-2 w-full max-w-[720px] rounded border bg-white/60 p-2">
                      {(() => {
                        const cp = entry.checkpoint as any;
                        const sha = (cp?.sha || '').slice(0, 7);
                        const filesChanged = cp?.stats?.filesChanged;
                        const additions = cp?.stats?.additions;
                        const deletions = cp?.stats?.deletions;
                        return (
                          <div className="text-[11px]">
                            <div className="flex items-center gap-2 text-foreground">
                              <GitCommit className="h-3.5 w-3.5" />
                              <span className="font-medium">Checkpoint</span>
                              {sha && (
                                <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">{sha}</code>
                              )}
                            </div>
                            {cp?.message && (
                              <div className="mt-1 text-[11px] text-muted-foreground">{cp.message}</div>
                            )}
                            {(typeof filesChanged === 'number' || typeof additions === 'number' || typeof deletions === 'number') && (
                              <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-3">
                                {typeof filesChanged === 'number' && <span>{filesChanged} files</span>}
                                {(typeof additions === 'number' || typeof deletions === 'number') && (
                                  <span>
                                    {typeof additions === 'number' && <span className="text-green-600">+{additions}</span>}
                                    {typeof additions === 'number' && typeof deletions === 'number' && <span> / </span>}
                                    {typeof deletions === 'number' && <span className="text-red-600">-{deletions}</span>}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            }
            const m = entry.msg;
            const role = m.role || 'system';
            const ts = m._creationTime ? new Date(m._creationTime) : undefined;
            const key = m._id || `${idx}-${m._creationTime || Date.now()}`;
            const content = m.contentText || (typeof m.raw === 'string' ? m.raw : undefined);
            const from = role === 'user' ? 'user' : 'assistant';
            return (
              <div key={key} className={`flex ${from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-full rounded border bg-background p-2 min-w-0">
                  <div className="text-sm markdown-content break-words" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {content ? (
                      <ReactMarkdown 
                        components={{
                          code: ({ children, ...props }) => {
                            return (
                              <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono break-words break-all" {...props}>
                                {children}
                              </code>
                            );
                          },
                          pre: ({ children }) => (
                            <pre className={preClamp}>
                              {children}
                            </pre>
                          ),
                          p: ({ children }) => <p className="mb-2 last:mb-0 break-words">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                          h1: ({ children }) => <h1 className="text-sm font-bold mb-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold mb-2">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 pl-2 italic">{children}</blockquote>,
                        }}
                      >
                        {content}
                      </ReactMarkdown>
                    ) : (
                      <pre className={preClamp}>{stringify(m.raw)}</pre>
                    )}
                  </div>
                  {/* <div className="text-[10px] text-muted-foreground mt-1">{ts && ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{m.type && ` • ${m.type}`}</div> */}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>
      {composer && (
        <div className="border-t shrink-0">
          {composer}
        </div>
      )}
    </div>
  );
}