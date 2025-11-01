import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, Brain, Wrench, CheckCircle, Paperclip } from "lucide-react";
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
  const [todosCollapsed, setTodosCollapsed] = useState(true);

  const isEmpty = !value.trim();
  const isSubmitDisabled = disabled || isEmpty;

  const currentTodo = (todos ?? [])
    .slice()
    .reverse()
    .find((t) => t.status === 'in_progress');
  const totalTodos = todos?.length ?? 0;
  const completedTodos = (todos ?? []).filter((t) => t.status === 'completed').length;

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

  

  return (
    <div className={cn("w-full", className)}>
      <div className="w-full">
        <div className="flex flex-col h-fit p-2">
          <div className="relative">
            {todos?.length ? (
              <div className="mx-3 w-[calc(100%-24px)] rounded-t-[12px] border border-black/10 border-b-0 bg-white/75 backdrop-blur-md">
                <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-gray-600 flex items-center justify-between">
                  <span>
                    todos {totalTodos > 0 ? `(${completedTodos}/${totalTodos})` : ''}
                  </span>
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
                {todosCollapsed ? (
                  currentTodo ? (
                    <div className="px-3 pb-2 text-sm text-gray-800 break-words">
                      {currentTodo.text}
                    </div>
                  ) : null
                ) : (
                  <ul className="max-h-40 overflow-auto px-3 pb-2 space-y-1">
                    {todos.map((todo, idx) => (
                      <li key={todo.id || `${todo.text}-${idx}`} className="flex items-start gap-2 text-sm text-gray-800 break-words">
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

          {/* Composer */}

            <div className="relative w-full border border-input bg-white/80 shadow-sm rounded-2xl">
              <div
                ref={editorRef}
                className="p-3 pr-3 max-h-[300px] min-h-[80px] text-gray-900 w-full overflow-y-auto outline-none text-[16px] selection:bg-black/10"
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

              {/* Footer: Agent + Send */}
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-b-2xl">
                <div className="flex items-center gap-1.5">
                  <input
                    id="bg-composer-file-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files;
                      void files?.length;
                      // reset so selecting the same file again still triggers change
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full hover:bg-black/5"
                    onClick={() => {
                      const el = document.getElementById("bg-composer-file-input") as HTMLInputElement | null;
                      el?.click();
                    }}
                    aria-label="Upload files"
                    title="Upload files"
                  >
                    <Paperclip width={14} height={14} />
                  </Button>
                </div>
                <Button
                  id="bg-composer-submit-btn"
                  type="button"
                  disabled={isSubmitDisabled}
                  onClick={handleSubmit}
                  variant="default"
                  size="icon"
                  className={[
                    "h-7 w-7 rounded-full bg-gray-900 text-white hover:opacity-90 disabled:bg-gray-300 disabled:text-gray-500",
                  ].join(" ")}
                  aria-label="Send message"
                >
                  <ArrowUp width={14} height={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
