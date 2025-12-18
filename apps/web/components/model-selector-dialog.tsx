"use client";

import { useState, useMemo } from "react";
import { Search, X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export type ProviderModel = {
  id: string;
  name?: string;
  providerId: string;
  providerName: string;
  limit?: { context: number };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: ProviderModel[];
  selectedModel?: { modelId: string; providerId: string };
  onSelect: (modelId: string, providerId: string) => void;
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Gemini",
  "github-copilot": "Copilot",
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "bg-orange-500",
  openai: "bg-emerald-500",
  google: "bg-blue-500",
  "github-copilot": "bg-zinc-500",
};

const CORE_MODELS: Record<string, string[]> = {
  anthropic: ["claude-opus-4-5"],
  openai: ["gpt-5.2", "gpt-5"],
  google: ["gemini-3-flash-preview", "gemini-3-pro-preview"],
  "github-copilot": [ "gemini-3-flash-preview", "claude-opus-4-5"],
};

const MODEL_TAGS: Record<string, string> = {
  "gemini-3-flash-preview": "Fast UI Developer",
  "gemini-3-pro-preview": "Smart UI Developer",
  "gpt-5.2": "Cracked engineer",
  "gpt-5": "Smart but slower",
  "gpt-4o": "Quick chatty",
  "claude-opus-4-5": "Best Engineer",
};

export default function ModelSelectorDialog({ open, onOpenChange, models, selectedModel, onSelect }: Props) {
  const [step, setStep] = useState<"featured" | "all" | "provider">("featured");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const coreModels = useMemo(() => models.filter(m => CORE_MODELS[m.providerId]?.includes(m.id)), [models]);

  const groupByProvider = (list: ProviderModel[]) => {
    const groups: Record<string, ProviderModel[]> = {};
    for (const model of list) {
      (groups[model.providerId] ??= []).push(model);
    }
    return groups;
  };

  const coreGrouped = useMemo(() => groupByProvider(coreModels), [coreModels]);
  const allGrouped = useMemo(() => groupByProvider(models), [models]);

  const providers = useMemo(() => {
    return [...new Set(models.map(m => m.providerId))].map(id => ({
      id,
      label: PROVIDER_LABELS[id] || id,
      count: allGrouped[id]?.length || 0,
    }));
  }, [models, allGrouped]);

  const handleSelect = (model: ProviderModel) => {
    onSelect(model.id, model.providerId);
    onOpenChange(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setStep("featured");
      setSelectedProvider(null);
      setSearch("");
    }
    onOpenChange(isOpen);
  };

  const goToProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    setStep("provider");
    setSearch("");
  };

  const goBack = () => {
    if (step === "provider") {
      setStep("all");
      setSelectedProvider(null);
      setSearch("");
    } else {
      setStep("featured");
    }
  };

  const hasMoreModels = models.length > coreModels.length;

  const ModelRow = ({ model, providerId }: { model: ProviderModel; providerId: string }) => {
    const isSelected = selectedModel?.modelId === model.id && selectedModel?.providerId === providerId;
    const tag = MODEL_TAGS[model.id];
    
    return (
      <button
        onClick={() => handleSelect(model)}
        className={cn(
          "w-full h-10 flex items-center gap-3 px-4 text-sm transition-colors",
          isSelected ? "bg-muted" : "hover:bg-muted/40"
        )}
      >
        <span className="flex-1 text-left font-medium truncate">
          {tag || model.name || model.id}
        </span>
        <span className="text-xs text-muted-foreground truncate max-w-24">
          {model.name || model.id}
        </span>
        {isSelected && <Check className="size-4 shrink-0" />}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[300px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="h-12 px-4 flex flex-row items-center border-b bg-muted/30">
          <DialogTitle className="text-sm font-medium">
            {step === "featured" && "Model"}
            {step === "all" && "Providers"}
            {step === "provider" && (PROVIDER_LABELS[selectedProvider!] || selectedProvider)}
          </DialogTitle>
        </DialogHeader>

        {/* Back */}
        {step !== "featured" && (
          <button 
            onClick={goBack} 
            className="h-9 px-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 border-b transition-colors"
          >
            <ChevronLeft className="size-3.5" />
            <span>Back</span>
          </button>
        )}

        {/* Featured */}
        {step === "featured" && (
          <div>
            {Object.entries(coreGrouped).map(([providerId, providerModels]) => (
              <div key={providerId}>
                <div className="h-8 px-4 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/50 bg-muted/30 border-b font-medium">
                  <span className={cn("size-2 rounded-full", PROVIDER_COLORS[providerId])} />
                  {PROVIDER_LABELS[providerId] || providerId}
                </div>
                {providerModels.map(model => (
                  <ModelRow key={model.id} model={model} providerId={providerId} />
                ))}
              </div>
            ))}

            {coreModels.length === 0 && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No models available
              </div>
            )}

            {hasMoreModels && (
              <button
                onClick={() => setStep("all")}
                className="w-full h-11 flex items-center justify-between px-4 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground border-t transition-colors"
              >
                <span>Explore all models</span>
                <span className="flex items-center gap-1.5 text-xs opacity-60">
                  <span>{models.length} available</span>
                  <ChevronRight className="size-3.5" />
                </span>
              </button>
            )}
          </div>
        )}

        {/* Providers */}
        {step === "all" && (
          <div className="py-1">
            {providers.map(provider => (
              <button
                key={provider.id}
                onClick={() => goToProvider(provider.id)}
                className="w-full h-11 flex items-center gap-3 px-4 text-sm hover:bg-muted/40 transition-colors"
              >
                <span className={cn("size-2.5 rounded-full", PROVIDER_COLORS[provider.id])} />
                <span className="flex-1 text-left font-medium">{provider.label}</span>
                <span className="text-xs text-muted-foreground/60">{provider.count} models</span>
                <ChevronRight className="size-4 text-muted-foreground/30" />
              </button>
            ))}
          </div>
        )}

        {/* Provider Models */}
        {step === "provider" && selectedProvider && (
          <>
            <div className="h-10 px-4 flex items-center gap-2.5 border-b bg-muted/20">
              <Search className="size-4 text-muted-foreground/50" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search models..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground/50 hover:text-foreground transition-colors">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <ScrollArea className="max-h-[260px]">
              {(allGrouped[selectedProvider] ?? [])
                .filter(m => !search.trim() || (m.name || m.id).toLowerCase().includes(search.toLowerCase()))
                .map(model => (
                  <ModelRow key={model.id} model={model} providerId={selectedProvider} />
                ))}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
