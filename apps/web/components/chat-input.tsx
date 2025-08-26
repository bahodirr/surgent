import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TodoItem = { 
  id: string; 
  text: string; 
  status?: 'pending' | 'in_progress' | 'completed'; 
};

type CompactStatus = {
  label: string;
  summary?: string;
  toolCount?: number;
  isActive?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'error';
};

type ChatInputProps = {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  todos?: TodoItem[];
  timeline?: any[];
};

export default function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = "Ask a follow-up question...",
  className,
  todos,
  timeline,
  
}: ChatInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [todosCollapsed, setTodosCollapsed] = useState(false);

  const isEmpty = !value.trim();
  const isSubmitDisabled = disabled || isEmpty;

  // Calculate status from timeline
  const status = (() => {
    if (!timeline?.length) return undefined;
    const last: any = timeline[timeline.length - 1];
    if (last?.kind === 'toolGroup') {
      const items = last.items || [];
      const total = items.length;
      const done = items.filter((mm: any) => mm?.tool?.result || mm?.tool?.status === 'completed' || mm?.tool?.status === 'error').length;
      return { label: done < total ? 'Running tools' : 'Tools finished', summary: total ? `${done}/${total} done` : undefined, isActive: done < total };
    }
    if (last?.kind === 'systemResult') {
      const m = last.msg;
      const usage = (m?.raw?.usage || m?.raw?.data?.usage || m?.raw?.result?.usage) as any;
      const inTok = usage?.input_tokens ?? usage?.input ?? usage?.prompt_tokens;
      const outTok = usage?.output_tokens ?? usage?.output ?? usage?.completion_tokens;
      const turns = m?.raw?.num_turns ?? m?.raw?.data?.num_turns ?? m?.raw?.result?.num_turns;
      const bits: string[] = [];
      if (typeof turns === 'number') bits.push(`${turns} turns`);
      if (typeof inTok === 'number' || typeof outTok === 'number') bits.push(`tok ${inTok ?? '-'} / ${outTok ?? '-'}`);
      return { label: 'Completed', summary: bits.join(' • ') || undefined, isActive: false };
    }
    if (last?.kind === 'message' && last.msg?.role === 'user') {
      return { label: 'Thinking…', isActive: true };
    }
    return undefined;
  })();

  const handleInput = useCallback(() => {
    setValue(editorRef.current?.innerText || "");
  }, []);

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text || isSubmitDisabled) return;
    
    onSubmit(text);
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
      setValue("");
    }
  }, [value, isSubmitDisabled, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  useEffect(() => {
    if (todos?.length) {
      setTodosCollapsed(false);
    }
  }, [todos]);

  return (
    <div className={cn("w-full", className)}>
      <div className="w-full">
        <div className="flex flex-col h-fit p-2">
          <div className="relative">
            {todos?.length ? (
              <div className="mx-3 w-[calc(100%-24px)] rounded-t-[12px] border border-black/10 border-b-0 bg-white/75 backdrop-blur-md">
                <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-gray-600 flex items-center justify-between">
                  <span>todos</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTodosCollapsed(!todosCollapsed)}
                    className="h-5 w-5 p-0 hover:bg-black/5 hover:cursor-pointer text-gray-700"
                    aria-label={todosCollapsed ? 'Expand todos' : 'Collapse todos'}
                    title={todosCollapsed ? 'Expand todos' : 'Collapse todos'}
                  >
                    <ChevronDown size={16} className={cn("transition-transform", todosCollapsed && "rotate-180")} />
                  </Button>
                </div>
                {!todosCollapsed && (
                  <ul className="max-h-40 overflow-auto px-3 pb-2 space-y-1">
                    {todos?.map((todo) => (
                      <li key={todo.id} className="flex items-start gap-2 text-sm text-gray-800 break-words">
                        <span className={cn(
                          "mt-[2px] h-3 w-3 inline-flex items-center justify-center rounded-full border",
                          todo.status === 'completed' ? "border-green-500 bg-green-500" : "border-gray-300 bg-white"
                        )}>
                          {todo.status === 'completed' && <Check size={10} className="text-white" />}
                        </span>
                        <span className={cn(todo.status === 'completed' && "line-through text-gray-500")}>
                          {todo.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {status && (
              <div className="mx-3 w-[calc(100%-24px)] border border-b-0 border-black/10 bg-white/75 backdrop-blur-md">
                <div className="px-3 py-1 text-[12px] flex items-center gap-2 text-gray-800">
                  {status.isActive && (
                    <span className="inline-flex h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  )}
                  <span className="font-medium">{status.label}</span>
                  {status.summary && (
                    <span className="text-gray-600">• {status.summary.slice(0, 40)}</span>
                  )}
                </div>
              </div>
            )}

            <div className="relative w-full border border-black/10 bg-white/60 shadow-lg backdrop-blur-md rounded-[12px]">
              <div
                ref={editorRef}
                className="p-3 pr-12 max-h-[258px] min-h-[50px] text-gray-900 w-full overflow-y-auto outline-none text-[16px] selection:bg-black/10"
                contentEditable={!disabled}
                role="textbox"
                aria-multiline="true"
                spellCheck
                tabIndex={0}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
              />
              {isEmpty && (
                <div className="absolute left-3.5 top-[12.5px] pointer-events-none text-gray-500 text-[16px]">
                  {placeholder}
                </div>
              )}
            </div>

            {/* Conversation toggle button */}
            

            <Button
              id="bg-composer-submit-btn"
              type="button"
              disabled={isSubmitDisabled}
              onClick={handleSubmit}
              variant="default"
              size="icon"
              className={[
                "h-4 min-h-4 w-4 min-w-4 rounded-full outline outline-gray-300 hover:scale-105 hover:bg-white hover:opacity-100 hover:outline-white bg-gray-300 transition-all duration-100 absolute bottom-4 right-3",
                isSubmitDisabled
                  ? "cursor-default bg-gray-300"
                  : "cursor-pointer opacity-100",
              ].join(" ")}
              aria-label="Send message"
            >
              <ArrowUp width={14} height={14} className={isSubmitDisabled ? "text-[#616163]" : "text-[#0a0a0a]"} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
