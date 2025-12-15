import { useState, useRef } from "react";
import { ArrowUp, Paperclip, X, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fileToDataUrl, filesToParts, type FileAttachment, type FilePart } from "@/lib/upload";

export type { FilePart };

type Props = {
  onSubmit: (value: string, files?: FilePart[], model?: string, providerID?: string) => void | Promise<void>;
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
  openai: { model: "gpt-5.2", provider: "openai", label: "GPT-5.2", badge: "Default", badgeClass: "bg-violet-100 text-violet-700 border-violet-200"},
} as const;

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function ChatInput({ onSubmit, disabled, placeholder = "Ask anything...", className, mode = "plan", onToggleMode, isWorking, onStop, isStopping }: Props) {
  const [value, setValue] = useState("");
  const [tier, setTier] = useState<keyof typeof TIERS>("openai");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: File[]) => {
    const valid = files.filter(f => f.size <= MAX_FILE_SIZE).slice(0, MAX_FILES - attachments.length);
    if (!valid.length) return;

    const newAttachments: FileAttachment[] = await Promise.all(
      valid.map(async (file) => ({
        file,
        preview: file.type.startsWith("image/") ? await fileToDataUrl(file) : undefined,
      }))
    );
    setAttachments(prev => [...prev, ...newAttachments].slice(0, MAX_FILES));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const text = value.trim();
    if ((!text && !attachments.length) || disabled || uploading) return;

    let fileParts: FilePart[] | undefined;

    if (attachments.length) {
      setUploading(true);
      try {
        fileParts = await filesToParts(attachments);
      } catch (err) {
        console.error("Failed to process files:", err);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    setValue("");
    setAttachments([]);
    const t = TIERS[tier];
    onSubmit(text, fileParts, t.model, t.provider);
  };

  const canSubmit = !uploading && !disabled && (value.trim() || attachments.length);

  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
        {/* File previews */}
        {attachments.length > 0 && (
          <div className="flex gap-1 sm:gap-1.5 p-2 sm:p-3 pb-0 flex-wrap">
            {attachments.map((a, i) => (
              <div key={i} className="relative group">
                <div className="size-8 sm:size-10 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {a.preview ? (
                    <img src={a.preview} alt={a.file.name} className="size-full object-cover" />
                  ) : (
                    <div className="size-full flex items-center justify-center">
                      <FileText className="size-3 sm:size-4 text-zinc-400" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -top-1 -right-1 size-4 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-800 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="w-full p-3 sm:p-4 resize-none outline-none text-sm min-h-[44px] sm:min-h-[48px] max-h-48 sm:max-h-72 bg-transparent text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          value={value}
          onChange={e => setValue(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={e => {
            if (e.key !== "Enter" || e.shiftKey) return;
            e.preventDefault();
            isWorking ? onStop?.() : handleSubmit();
          }}
          placeholder={placeholder}
          rows={1}
        />
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap min-w-0">
            {/* File attach button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.css,.html"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= MAX_FILES || uploading}
              className="size-8 shrink-0 rounded-full text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Paperclip className="size-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleMode}
              className={cn(
                "h-8 px-2 sm:px-3 rounded-full text-xs font-medium transition-colors shrink-0",
                mode === "plan"
                  ? "bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              <span className={cn("sm:mr-1.5 size-1.5 rounded-full", mode === "plan" ? "bg-violet-600 dark:bg-violet-400" : "bg-zinc-400")} />
              <span className="hidden sm:inline">Chat mode</span>
            </Button>

            <Select value={tier} onValueChange={v => setTier(v as keyof typeof TIERS)}>
              <SelectTrigger size="sm" className="h-8 rounded-full border-0 bg-transparent px-2 sm:px-3 text-xs w-auto hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors shadow-none focus:ring-0">
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <span className="hidden sm:inline">{TIERS[tier].label}</span>
                  <span className={`text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full border ${TIERS[tier].badgeClass}`}>{TIERS[tier].badge}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIERS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        {v.label}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${v.badgeClass}`}>{v.badge}</span>
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            disabled={isStopping || (!isWorking && !canSubmit)}
            onClick={isWorking ? onStop : handleSubmit}
            variant={isWorking ? "outline" : "default"}
            size="sm"
            className={cn(
              "rounded-full transition-all duration-200 shrink-0",
              isWorking
                ? "h-8 px-3 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 bg-transparent"
                : "size-8 p-0 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm"
            )}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isWorking ? (
              <span className="flex items-center gap-1.5 text-xs">
                {isStopping ? <span className="size-2 rounded-full bg-red-600 animate-spin" /> : <span className="size-2 rounded-full bg-red-600 animate-pulse" />}
                <span className="sr-only">Stop</span>
              </span>
            ) : <ArrowUp className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
