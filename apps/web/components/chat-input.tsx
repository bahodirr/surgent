import { useCallback, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatInputProps = {
  onSubmit: (value: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  mode?: 'plan' | 'build';
  onToggleMode?: () => void;
};

export default function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = "Ask a follow-up question...",
  className,
  mode = 'plan',
  onToggleMode,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const isEmpty = !value.trim();
  const isSubmitDisabled = disabled || isEmpty;

  const handleSubmit = useCallback(async () => {
    const text = value.trim();
    if (!text || disabled) return;
    // Clear optimistically so input always resets after submit
    setValue("");
    try {
      await Promise.resolve(onSubmit(text));
    } catch {
      // ignore errors; we don't repopulate the input
    }
  }, [value, disabled, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className={cn("w-full", className)}>
      <div className="w-full">
        <div className="flex flex-col h-fit p-2">
          <div className="relative w-full border border-input bg-white/80 shadow-sm rounded-2xl">
            {/* Mode toggle badge (left-bottom) */}
            <div className="absolute bottom-2 left-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleMode}
                aria-pressed={mode === 'plan'}
                className={cn(
                  "h-7 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer select-none border",
                  mode === 'plan'
                    ? "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700"
                    : "bg-transparent text-foreground/70 border-transparent hover:bg-foreground/5",
                )}
                aria-label="Toggle mode"
              >
                <span
                  className={cn(
                    "mr-1.5 inline-block h-2 w-2 rounded-full",
                    mode === 'plan' ? "bg-purple-500" : "bg-foreground/40",
                  )}
                />
                Discuss (No edits)
              </Button>
            </div>
            <textarea
              className={cn(
                "p-3 pr-12 max-h-[300px] min-h-[80px] text-gray-900 w-full resize-none outline-none text-[16px] selection:bg-black/10 bg-transparent"
              )}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              rows={3}
            />
            <div className="absolute bottom-2 right-2">
              <Button
                id="bg-composer-submit-btn"
                type="button"
                disabled={isSubmitDisabled}
                onClick={handleSubmit}
                variant="default"
                size="icon"
                className="h-7 w-7 rounded-full bg-gray-900 text-white hover:opacity-90 disabled:bg-gray-300 disabled:text-gray-500"
                aria-label="Send message"
              >
                <ArrowUp width={14} height={14} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
