"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ExternalLink, Key, ChevronLeft, ChevronRight, AlertCircle, X, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { http } from "@/lib/http";

type ProviderInfo = {
  id: string;
  models: Record<string, { name?: string; limit?: { context: number } }>;
};

type ProviderList = {
  all: ProviderInfo[];
  connected: string[];
};

type AuthMethod = {
  type: "oauth" | "api";
  label: string;
};

type AuthMethodsMap = Record<string, AuthMethod[]>;

type OAuthAuthorizeResponse = {
  url: string;
  method: "auto" | "code";
  instructions?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
};

const ALLOWED_PROVIDERS = ["anthropic", "openai", "google", "github-copilot"];

const PROVIDER_META: Record<string, { label: string; icon: string }> = {
  anthropic: { label: "Claude", icon: "/claude-logo.svg" },
  openai: { label: "OpenAI", icon: "/OpenAI-logo.svg" },
  google: { label: "Gemini", icon: "/google-gemini.svg" },
  "github-copilot": { label: "GitHub Copilot", icon: "/github-copilot-icon.webp" },
};

export default function ProviderDialog({ open, onOpenChange, projectId }: Props) {
  const queryClient = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [step, setStep] = useState<"list" | "auth-methods" | "oauth" | "api-key">("list");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [oauthState, setOauthState] = useState<{
    url?: string;
    method?: "auto" | "code";
    instructions?: string;
    methodIndex?: number;
    code?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);

  const { data: providers, isLoading: loadingProviders } = useQuery<ProviderList>({
    queryKey: ["providers", projectId],
    enabled: Boolean(projectId) && open,
    staleTime: 30_000,
    queryFn: async () => http.get(`api/agent/${projectId}/provider`).json(),
  });

  const { data: authMethods, isLoading: loadingAuth } = useQuery<AuthMethodsMap>({
    queryKey: ["provider-auth", projectId],
    enabled: Boolean(projectId) && open,
    staleTime: 60_000,
    queryFn: async () => http.get(`api/agent/${projectId}/provider/auth`).json(),
  });

  const authorizeMutation = useMutation({
    mutationFn: async ({ providerId, methodIndex }: { providerId: string; methodIndex: number }) => {
      const resp = await http.post(`api/agent/${projectId}/provider/${providerId}/oauth/authorize`, {
        json: { method: methodIndex },
      }).json<OAuthAuthorizeResponse>();
      return resp;
    },
    onSuccess: (data, { methodIndex }) => {
      setOauthState({ ...data, methodIndex, code: "" });
      setStep("oauth");
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (err: Error) => setError(err.message),
  });

  const callbackMutation = useMutation({
    mutationFn: async ({ providerId, methodIndex, code }: { providerId: string; methodIndex: number; code?: string }) => {
      await http.post(`api/agent/${projectId}/provider/${providerId}/oauth/callback`, {
        json: { method: methodIndex, code },
      }).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers", projectId] });
      queryClient.invalidateQueries({ queryKey: ["provider-auth", projectId] });
      resetState();
    },
    onError: (err: Error) => setError(err.message),
  });

  const apiKeyMutation = useMutation({
    mutationFn: async ({ providerId, key }: { providerId: string; key: string }) => {
      await http.put(`api/agent/${projectId}/auth/${providerId}`, {
        json: { type: "api", key },
      }).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers", projectId] });
      queryClient.invalidateQueries({ queryKey: ["provider-auth", projectId] });
      resetState();
    },
    onError: (err: Error) => setError(err.message),
  });

  const resetState = () => {
    setSelectedProvider(null);
    setStep("list");
    setApiKeyInput("");
    setOauthState({});
    setError(null);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  const handleSelectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    setError(null);
    const methods = authMethods?.[providerId];
    setStep(methods?.length ? "auth-methods" : "api-key");
  };

  const handleSelectMethod = (methodIndex: number) => {
    if (!selectedProvider) return;
    const method = authMethods?.[selectedProvider]?.[methodIndex];
    if (!method) return;
    if (method.type === "api") {
      setStep("api-key");
    } else {
      authorizeMutation.mutate({ providerId: selectedProvider, methodIndex });
    }
  };

  const handleOAuthComplete = () => {
    if (!selectedProvider || oauthState.methodIndex === undefined) return;
    callbackMutation.mutate({
      providerId: selectedProvider,
      methodIndex: oauthState.methodIndex,
      code: oauthState.method === "code" ? oauthState.code : undefined,
    });
  };

  const handleApiKeySave = () => {
    if (!selectedProvider || !apiKeyInput.trim()) return;
    apiKeyMutation.mutate({ providerId: selectedProvider, key: apiKeyInput.trim() });
  };

  const connected = providers?.connected ?? [];
  const apiProviders = providers?.all ?? [];
  // Always show all allowed providers, even if not returned by API
  const allProviders = ALLOWED_PROVIDERS.map(id => {
    const fromApi = apiProviders.find(p => p.id === id);
    return fromApi || { id, models: {} };
  });
  const meta = selectedProvider ? PROVIDER_META[selectedProvider] : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[320px] p-0 gap-0 rounded-xl overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-sm font-semibold">Connect Your AI</DialogTitle>
        </DialogHeader>
        
        {step === "list" && (
          <div className="mx-3 mt-3 p-3 rounded-lg bg-muted border border-dashed">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Have <span className="font-medium text-foreground">Claude Pro</span>, <span className="font-medium text-foreground">ChatGPT Plus</span>, or <span className="font-medium text-foreground">Copilot</span>? Link it and pay <span className="font-semibold text-success">$0</span> for AI.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-lg text-xs bg-destructive/10 text-destructive">
            <AlertCircle className="size-3 shrink-0" />
            <span className="flex-1 truncate">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0"><X className="size-3" /></button>
          </div>
        )}

        <div className="p-3 space-y-1">
          {/* Provider List */}
          {step === "list" && (
            loadingProviders ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              allProviders.map((p) => {
                const isConnected = connected.includes(p.id);
                const { label, icon } = PROVIDER_META[p.id] || { label: p.id, icon: "" };
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProvider(p.id)}
                    className="w-full h-11 flex items-center gap-3 px-3 rounded-lg text-sm hover:bg-muted transition-colors"
                  >
                    {icon && <Image src={icon} alt="" width={18} height={18} />}
                    <span className="flex-1 text-left font-medium">{label}</span>
                    {isConnected ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">
                        <span className="size-1.5 rounded-full bg-success" />
                        Connected
                      </span>
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground/50" />
                    )}
                  </button>
                );
              })
            )
          )}

          {/* Auth Methods */}
          {step === "auth-methods" && (
            <>
              <button onClick={() => setStep("list")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
                <ChevronLeft className="size-3" /> Back
              </button>
              <div className="flex items-center gap-2 mb-3">
                {meta?.icon && <Image src={meta.icon} alt="" width={20} height={20} />}
                <span className="font-semibold">{meta?.label}</span>
              </div>
              {(selectedProvider === "anthropic" || selectedProvider === "github-copilot") && (
                <div className="flex items-start gap-2 px-3 py-2 mb-3 rounded-lg text-[11px] text-muted-foreground bg-warning/10 border border-warning/20">
                  <Info className="size-3.5 shrink-0 mt-0.5 text-warning" />
                  <span>
                    {selectedProvider === "anthropic" 
                      ? "Claude subscription may take ~5 mins to sync after connecting."
                      : "Copilot subscription may take ~5 mins to sync after connecting."}
                  </span>
                </div>
              )}
              {loadingAuth ? (
                <div className="flex items-center justify-center h-16">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1">
                  {(authMethods?.[selectedProvider!] ?? []).map((m, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectMethod(i)}
                      disabled={authorizeMutation.isPending}
                      className="w-full h-11 flex items-center gap-3 px-3 rounded-lg text-sm bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {m.type === "oauth" ? <ExternalLink className="size-4 text-muted-foreground" /> : <Key className="size-4 text-muted-foreground" />}
                      <span className="flex-1 text-left font-medium">{m.label}</span>
                      {authorizeMutation.isPending && <Loader2 className="size-3 animate-spin" />}
                    </button>
                  ))}
                  {!(authMethods?.[selectedProvider!] ?? []).some(m => m.type === "api") && (
                    <button onClick={() => setStep("api-key")} className="w-full h-11 flex items-center gap-3 px-3 rounded-lg text-sm bg-muted/40 hover:bg-muted transition-colors">
                      <Key className="size-4 text-muted-foreground" />
                      <span className="flex-1 text-left font-medium">Enter API key</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* OAuth */}
          {step === "oauth" && (() => {
            // Extract code from instructions like "Enter code: XXXX-XXXX"
            const codeMatch = oauthState.instructions?.match(/:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);
            const deviceCode = codeMatch?.[1];
            return (
              <>
                <button onClick={() => setStep("auth-methods")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
                  <ChevronLeft className="size-3" /> Back
                </button>
                <div>
                  {deviceCode ? (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-3">Enter this code in your browser:</p>
                      <button 
                        className="inline-block text-2xl font-mono font-bold tracking-[0.3em] py-4 px-6 bg-muted rounded-lg select-all cursor-pointer hover:bg-muted/80 transition-colors border border-dashed"
                        onClick={() => navigator.clipboard.writeText(deviceCode)}
                      >
                        {deviceCode}
                      </button>
                      <p className="text-[10px] text-muted-foreground mt-2">Click to copy</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-3">
                      {oauthState.instructions || "Complete authorization in the browser window."}
                    </p>
                  )}
                  {oauthState.method === "code" && (
                    <Input
                      value={oauthState.code || ""}
                      onChange={(e) => setOauthState((s) => ({ ...s, code: e.target.value }))}
                      placeholder="Paste code"
                      className="h-10 text-sm mt-4"
                    />
                  )}
                  <Button
                    onClick={handleOAuthComplete}
                    disabled={oauthState.method === "code" ? !oauthState.code?.trim() || callbackMutation.isPending : callbackMutation.isPending}
                    className="w-full h-10 mt-4"
                  >
                    {callbackMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                    Done
                  </Button>
                  {oauthState.method !== "code" && (
                    <button
                      onClick={() => oauthState.url && window.open(oauthState.url, "_blank")}
                      className="w-full h-8 mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="size-3" /> Open link again
                    </button>
                  )}
                </div>
              </>
            );
          })()}

          {/* API Key */}
          {step === "api-key" && (
            <>
              <button onClick={() => {
                const methods = authMethods?.[selectedProvider!];
                setStep(methods?.length ? "auth-methods" : "list");
              }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
                <ChevronLeft className="size-3" /> Back
              </button>
              <div className="flex items-center gap-2 mb-3">
                {meta?.icon && <Image src={meta.icon} alt="" width={20} height={20} />}
                <span className="font-semibold">{meta?.label}</span>
              </div>
              {(selectedProvider === "anthropic" || selectedProvider === "github-copilot") && (
                <div className="flex items-start gap-2 px-3 py-2 mb-3 rounded-lg text-[11px] text-muted-foreground bg-warning/10 border border-warning/20">
                  <Info className="size-3.5 shrink-0 mt-0.5 text-warning" />
                  <span>
                    {selectedProvider === "anthropic" 
                      ? "Claude subscription may take ~5 mins to sync after connecting."
                      : "Copilot subscription may take ~5 mins to sync after connecting."}
                  </span>
                </div>
              )}
              <div className="space-y-3">
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="h-10"
                />
                <Button
                  onClick={handleApiKeySave}
                  disabled={!apiKeyInput.trim() || apiKeyMutation.isPending}
                  className="w-full h-10"
                >
                  {apiKeyMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                  Save API Key
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
