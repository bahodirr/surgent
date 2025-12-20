import { useState, useRef, useMemo } from "react";
import { ArrowUp, Paperclip, X, Loader2, FileText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fileToDataUrl, uploadFile, attachmentsToParts, type UploadingAttachment, type FilePart } from "@/lib/upload";
import ModelSelectorDialog, { type ProviderModel } from "./model-selector-dialog";

export type { FilePart, ProviderModel };

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
  value?: string;
  onValueChange?: (value: string) => void;
  models?: ProviderModel[];
  selectedModel?: { modelId: string; providerId: string };
  onModelChange?: (modelId: string, providerId: string) => void;
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "bg-provider-anthropic",
  openai: "bg-provider-openai",
  google: "bg-provider-google",
  "github-copilot": "bg-provider-github-copilot",
};

// Fallback models when no providers are connected
const FALLBACK_MODELS: ProviderModel[] = [
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", providerId: "google", providerName: "Gemini" },
  { id: "gpt-5.2", name: "GPT-5.2", providerId: "openai", providerName: "OpenAI" },
];

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function ChatInput({ 
  onSubmit, 
  disabled, 
  placeholder = "Ask anything...", 
  className, 
  mode = "plan", 
  onToggleMode, 
  isWorking, 
  onStop, 
  isStopping, 
  value: controlledValue, 
  onValueChange,
  models = FALLBACK_MODELS,
  selectedModel,
  onModelChange,
}: Props) {
  const [internalValue, setInternalValue] = useState("");
  const value = controlledValue ?? internalValue;
  const setValue = onValueChange ?? setInternalValue;
  const [attachments, setAttachments] = useState<UploadingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const [modelDialogOpen, setModelDialogOpen] = useState(false);

  // Find current selected model
  const currentModel = useMemo(() => {
    if (selectedModel) {
      return models.find(m => m.id === selectedModel.modelId && m.providerId === selectedModel.providerId);
    }
    return models[0];
  }, [models, selectedModel]);

  const handleModelSelect = (modelId: string, providerId: string) => {
    onModelChange?.(modelId, providerId);
  };

  const addFiles = async (files: File[]) => {
    const valid = files.filter(f => f.size <= MAX_FILE_SIZE).slice(0, MAX_FILES - attachments.length);
    if (!valid.length) return;

    const newAttachments: UploadingAttachment[] = await Promise.all(
      valid.map(async (file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: file.type.startsWith("image/") ? await fileToDataUrl(file) : undefined,
        status: "uploading" as const,
      }))
    );

    setAttachments(prev => [...prev, ...newAttachments].slice(0, MAX_FILES));

    for (const attachment of newAttachments) {
      uploadFile(attachment.file)
        .then(({ url, size }) => {
          setAttachments(prev =>
            prev.map(a => a.id === attachment.id ? { ...a, status: "done", url, size } : a)
          );
        })
        .catch(() => {
          setAttachments(prev =>
            prev.map(a => a.id === attachment.id ? { ...a, status: "error" } : a)
          );
        });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (!isDragging && e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = async () => {
    const hasUploading = attachments.some(a => a.status === "uploading");
    if ((!value.trim() && !attachments.length) || disabled || hasUploading) return;

    const fileParts = attachmentsToParts(attachments);
    const text = value.trim();

    setValue("");
    setAttachments([]);
    const model = currentModel ?? models[0] ?? FALLBACK_MODELS[0];
    if (!model) return;
    onSubmit(text, fileParts.length ? fileParts : undefined, model.id, model.providerId);
  };

  const hasUploading = attachments.some(a => a.status === "uploading");
  const canSubmit = !hasUploading && !disabled && (value.trim() || attachments.length);

  return (
    <div
      className={cn("w-full relative", className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className={cn(
        "absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-brand bg-brand/10 flex items-center justify-center pointer-events-none transition-opacity duration-150",
        isDragging ? "opacity-100" : "opacity-0"
      )}>
        <span className="text-sm font-medium text-brand">Drop files here</span>
      </div>
      <div className={cn(
        "rounded-2xl border bg-background shadow-lg overflow-hidden transition-colors",
        isDragging ? "border-brand" : "border-border"
      )}>
        {/* File previews */}
        {attachments.length > 0 && (
          <div className="flex gap-1 sm:gap-1.5 p-2 sm:p-3 pb-0 flex-wrap">
            {attachments.map((a) => (
              <div key={a.id} className="relative group">
                <div className="size-8 sm:size-10 rounded-lg overflow-hidden bg-muted">
                  {a.url || a.preview ? (
                    <img src={a.url || a.preview} alt={a.file.name} className="size-full object-cover" />
                  ) : (
                    <div className="size-full flex items-center justify-center">
                      <FileText className="size-3 sm:size-4 text-muted-foreground" />
                    </div>
                  )}
                  {a.status === "uploading" && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="size-4 text-white animate-spin" />
                    </div>
                  )}
                  {a.status === "error" && (
                    <div className="absolute inset-0 bg-danger/40 flex items-center justify-center">
                      <X className="size-4 text-white" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="absolute -top-1 -right-1 size-4 rounded-full bg-foreground text-background flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="w-full p-3 sm:p-4 resize-none outline-none text-sm min-h-[44px] sm:min-h-[48px] max-h-48 sm:max-h-72 bg-transparent text-foreground placeholder:text-muted-foreground"
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
              disabled={attachments.length >= MAX_FILES}
              className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
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
                  ? "bg-brand/10 text-brand hover:bg-brand/15"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <span className={cn("sm:mr-1.5 size-1.5 rounded-full", mode === "plan" ? "bg-brand" : "bg-muted-foreground")} />
              <span className="hidden sm:inline">Chat mode</span>
            </Button>

            <button 
              onClick={() => setModelDialogOpen(true)}
              className="h-8 px-2 sm:px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center gap-1.5"
            >
              {currentModel ? (
                <>
                  <span className={cn("size-1.5 rounded-full", PROVIDER_COLORS[currentModel.providerId] || "bg-muted-foreground")} />
                  <span className="max-w-28 truncate">{currentModel.name || currentModel.id}</span>
                </>
              ) : (
                <span>Select model</span>
              )}
              <ChevronDown className="size-3 opacity-50" />
            </button>
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
                ? "h-8 px-3 text-danger border-danger/30 hover:bg-danger/10 bg-transparent"
                : "size-8 p-0 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            )}
          >
            {isWorking ? (
              <span className="flex items-center gap-1.5 text-xs">
                {isStopping ? <span className="size-2 rounded-full bg-danger animate-spin" /> : <span className="size-2 rounded-full bg-danger animate-pulse" />}
                <span className="sr-only">Stop</span>
              </span>
            ) : <ArrowUp className="size-4" />}
          </Button>
        </div>
      </div>

      <ModelSelectorDialog
        open={modelDialogOpen}
        onOpenChange={setModelDialogOpen}
        models={models}
        selectedModel={selectedModel}
        onSelect={handleModelSelect}
      />
    </div>
  );
}
