import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  onSubmit: (value: string, model?: string, providerID?: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  mode?: "plan" | "build";
  onToggleMode?: () => void;
  isWorking?: boolean;
  onStop?: () => void;
  isStopping?: boolean;
};

const TIERS = {
  intern: { model: "big-pickle", provider: "opencode", label: "Intern", badge: "Free", badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  engineer: { model: "glm-4.6", provider: "zai", label: "Engineer", badge: "Paid", badgeClass: "bg-amber-100 text-amber-700 border-amber-200" },
  en: { model: "gpt-5.1-codex", provider: "openai", label: "Cracked Dev", badge: "Pro", badgeClass: "bg-violet-100 text-violet-700 border-violet-200" },
} as const;

export default function ChatInput({ onSubmit, disabled, placeholder = "Ask anything...", className, mode = "plan", onToggleMode, isWorking, onStop, isStopping }: Props) {
  const [value, setValue] = useState("");
  const [tier, setTier] = useState<keyof typeof TIERS>("en");

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    const t = TIERS[tier];
    onSubmit(text, t.model, t.provider);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <textarea
          className="w-full p-4 resize-none outline-none text-sm min-h-[48px] max-h-72 bg-transparent text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleMode}
              className={cn(
                "h-7 px-3 rounded-full text-xs font-medium border",
                mode === "plan"
                  ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/50"
                  : "text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <span className={cn("mr-1.5 size-1.5 rounded-full", mode === "plan" ? "bg-violet-600 dark:bg-violet-400" : "bg-zinc-400")} />
              Chat mode
            </Button>

            <Select value={tier} onValueChange={v => setTier(v as keyof typeof TIERS)}>
              <SelectTrigger size="sm" className="h-7 rounded-full border-zinc-200 dark:border-zinc-700 px-3 text-xs w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIERS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-1.5">
                      {v.label}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${v.badgeClass}`}>{v.badge}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            disabled={isStopping || (!isWorking && (disabled || !value.trim()))}
            onClick={isWorking ? onStop : handleSubmit}
            variant={isWorking ? "outline" : "default"}
            size="sm"
            className={cn(
              "h-7 rounded-full",
              isWorking
                ? "px-3 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                : "size-7 p-0 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
            )}
          >
            {isWorking ? (
              <span className="flex items-center gap-1.5 text-xs">
                {isStopping ? <span className="size-3 rounded-full border-2 border-red-600/40 border-t-red-600 animate-spin" /> : <span className="size-1.5 rounded-full bg-red-600 animate-pulse" />}
                {isStopping ? "Stopping" : "Stop"}
              </span>
            ) : <ArrowUp className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
