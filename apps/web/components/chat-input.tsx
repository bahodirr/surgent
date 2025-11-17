import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ChatInputProps = {
  onSubmit: (value: string, model?: string, providerID?: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  mode?: 'plan' | 'build';
  onToggleMode?: () => void;
  isWorking?: boolean;
  onStop?: () => void;
  isStopping?: boolean;
};

export default function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = "Ask a follow-up question...",
  className,
  mode = 'plan',
  onToggleMode,
  isWorking = false,
  onStop,
  isStopping = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [tier, setTier] = useState("engineer");

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    const model = tier === "engineer" ? "glm-4.6" : "big-pickle";
    const providerId = tier === "engineer" ? "zai" : "opencode";
    onSubmit(text, model, providerId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="w-full flex flex-col gap-1.5">
        <div className="relative w-full rounded-2xl border border-input bg-white shadow-sm overflow-hidden">
          <div className="relative">
            <textarea
              className="p-4 max-h-[300px] min-h-[80px] text-gray-900 w-full resize-none outline-none text-[16px] selection:bg-black/10 bg-transparent"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-transparent border-t border-foreground/10">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleMode}
                aria-pressed={mode === 'plan'}
                className={cn(
                  "group h-8 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer select-none border disabled:opacity-50 disabled:cursor-not-allowed",
                  mode === 'plan'
                    ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300"
                    : "bg-transparent text-foreground/60 border-foreground/10 hover:text-foreground/80 hover:bg-foreground/5 hover:border-foreground/20",
                )}
                aria-label="Toggle mode"
              >
                <span
                  className={cn(
                    "mr-1.5 inline-block h-1.5 w-1.5 rounded-full transition-colors",
                    mode === 'plan' ? "bg-purple-600" : "bg-foreground/40 group-hover:bg-foreground/60",
                  )}
                />
                Chat mode</Button>

              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger
                  size="sm"
                  className="rounded-full border border-input bg-background px-3 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="intern">
                    <span className="flex items-center gap-1">
                      <span>Intern</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        Free
                      </span>
                    </span>
                  </SelectItem>
                  <SelectItem value="engineer">
                    <span className="flex items-center gap-1">
                      <span>Engineer</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        Paid
                      </span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              disabled={isStopping || (!isWorking && (disabled || !value.trim()))}
              onClick={isWorking ? onStop : handleSubmit}
              variant={isWorking ? "outline" : "default"}
              size={isWorking ? "sm" : "icon"}
              className={cn(
                "h-8 rounded-full cursor-pointer",
                isWorking
                  ? "px-3 bg-red-50 text-red-600 hover:bg-red-100 border-red-300 hover:border-red-400"
                  : "w-8 bg-gray-900 text-white hover:opacity-90 disabled:bg-gray-300 disabled:text-gray-500",
              )}
            >
              {isWorking ? (
                <div className="flex items-center gap-1.5">
                  {isStopping ? (
                    <span className="h-3 w-3 rounded-full border-2 border-red-600/40 border-t-red-600 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
                  )}
                  <span className="text-xs font-medium">{isStopping ? "Stopping" : "Stop"}</span>
                </div>
              ) : (
                <ArrowUp width={16} height={16} />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
