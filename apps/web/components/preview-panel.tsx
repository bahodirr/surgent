"use client";

import { WebPreview, WebPreviewNavigation, WebPreviewUrl, WebPreviewBody, WebPreviewNavigationButton } from '@/components/ai-elements/web-preview';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Copy, Rocket } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api, Id } from '@repo/backend';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DeployDialog from '@/components/deploy-dialog';
import TerminalWidget from '@/components/terminal/terminal-widget';
import { useSandbox } from '@/hooks/use-sandbox';
 
interface PreviewPanelProps {
  projectId?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function PreviewPanel({ projectId, onPreviewUrl }: PreviewPanelProps) {
  const setSandboxId = useSandbox((s: { setSandboxId: (id: string | null) => void }) => s.setSandboxId);
  const activateProject = useMutation(api.projects.activateProject);
  const deployProject = useMutation(api.projects.deployProject);
  const project = useQuery(api.projects.getProject, projectId ? { projectId: projectId as Id<'projects'> } : 'skip');

  const proxyHost = process.env.NEXT_PUBLIC_PROXY_URL;
  const sandboxId = project?.sandboxId;
  const hasSandbox = Boolean(sandboxId && proxyHost);
  const isReady = hasSandbox;
  const previewUrl = isReady ? `https://3000-${sandboxId}.${proxyHost}` : undefined;
  const initStatus: 'idle' | 'initializing' | 'ready' | 'error' = isReady ? 'ready' : 'initializing';

  useEffect(() => {
    if (!projectId) return;
    activateProject({ projectId: projectId as Id<'projects'> }).catch(() => {});
  }, [projectId, activateProject]);

  useEffect(() => {
    if (!onPreviewUrl) return;
    onPreviewUrl(previewUrl ?? null);
  }, [previewUrl, onPreviewUrl]);

  // Push sandboxId to global store for other components (e.g., Conversation)
  useEffect(() => {
    if (hasSandbox && typeof sandboxId === 'string') {
      setSandboxId(sandboxId);
    } else {
      setSandboxId(null);
    }
  }, [hasSandbox, sandboxId, setSandboxId]);

  const [currentUrl, setCurrentUrl] = useState(previewUrl || '');
  const [reloadCount, setReloadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  // Using shadcn Tabs for tab state & rendering

  const webPreviewKey = useMemo(() => `${previewUrl ?? 'empty'}:${reloadCount}`, [previewUrl, reloadCount]);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const startProgress = useCallback(() => {
    setIsLoading(true);
    setProgress(30);
    clearProgressTimer();
    progressTimerRef.current = setTimeout(() => setProgress(70), 400);
  }, [clearProgressTimer]);

  const finishProgress = useCallback(() => {
    setProgress(100);
    clearProgressTimer();
    setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
    }, 250);
  }, [clearProgressTimer]);

  const handleReload = useCallback(() => {
    startProgress();
    setReloadCount((c) => c + 1);
  }, [startProgress]);
  const handleCopy = useCallback(() => {
    const url = currentUrl || previewUrl || '';
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
  }, [currentUrl, previewUrl]);
  const handleOpen = useCallback(() => {
    const url = currentUrl || previewUrl || '';
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [currentUrl, previewUrl]);

  const handleConfirmDeploy = useCallback(async (sanitizedName: string) => {
    if (!projectId || isDeploying) return;
    setIsDeploying(true);
    try {
      await deployProject({ projectId: projectId as Id<'projects'>, deployName: sanitizedName });
      setIsDialogOpen(false);
    } catch {}
    setIsDeploying(false);
  }, [deployProject, isDeploying, projectId]);

  // Kick off progress when preview becomes ready with a URL (initial load)
  useEffect(() => {
    if (initStatus === 'ready' && (previewUrl || currentUrl)) {
      startProgress();
    }
  }, [initStatus]);

  useEffect(() => () => clearProgressTimer(), [clearProgressTimer]);

  const headerActions = (
    <div className="flex items-center gap-3">
        {(project as any)?.deployment?.status ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize">
            <span
              className={`h-2 w-2 rounded-full ${
                String((project as any)?.deployment?.status || '') === 'deployed'
                  ? 'bg-green-500'
                  : ['build_failed','deploy_failed'].includes(String((project as any)?.deployment?.status || ''))
                  ? 'bg-red-500'
                  : ['queued','starting','resuming','building','uploading'].includes(String((project as any)?.deployment?.status || ''))
                  ? 'bg-blue-500 animate-pulse'
                  : 'bg-muted-foreground/50'
              }`}
            />
            {String((project as any)?.deployment?.status).replace('_', ' ')}
          </span>
        ) : null}
        {String((project as any)?.deployment?.status || '') === 'deployed' ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                setIsDialogOpen(true);
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Rocket className="h-4 w-4" /> Redeploy
              </span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer"
              disabled={!previewUrl}
              onClick={handleOpen}
            >
              <ExternalLink className="h-4 w-4" /> Open
            </Button>
          </div>
        ) : ['queued','starting','resuming','building','uploading'].includes(String((project as any)?.deployment?.status || '')) ? (
          <Button
            size="sm"
            variant="secondary"
            className="cursor-pointer"
            disabled={!previewUrl}
            onClick={handleOpen}
          >
            <ExternalLink className="h-4 w-4" /> Open
          </Button>
        ) : (
          <Button
            size="sm"
            className="cursor-pointer"
            disabled={!projectId || isDeploying}
            onClick={() => setIsDialogOpen(true)}
          >
            <span className="inline-flex items-center gap-1">
              <Rocket className="h-4 w-4" /> Deploy
            </span>
          </Button>
        )}
      </div>
  );

  return (
    <div className="h-full flex flex-col relative">
      <Tabs defaultValue="preview" className="h-full flex flex-col gap-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-3">
            <TabsList className="bg-white border gap-1.5 p-1 rounded-lg">
              <TabsTrigger value="preview" className="cursor-pointer select-none px-5 py-2 rounded-md data-[state=active]:bg-gray-100 data-[state=active]:shadow-none">Preview</TabsTrigger>
            </TabsList>
          </div>
          {headerActions}
        </div>

        <TabsContent value="preview" className="flex-1 bg-background min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col">
            {initStatus !== 'ready' ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                  <div className="h-8 w-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Preparing preview...</span>
                </div>
              </div>
            ) : (
              <WebPreview
                key={webPreviewKey}
                defaultUrl={previewUrl || ''}
                onUrlChange={(u) => { setCurrentUrl(u); onPreviewUrl?.(u || null); startProgress(); }}
                className="h-full border-0"
              >
                <div className="absolute bottom-0 left-0 right-0 z-10 h-0.5">
                  <div
                    className="h-full bg-primary transition-[width] duration-200 ease-out"
                    style={{ width: isLoading ? `${progress}%` : '0%' }}
                  />
                </div>
                <WebPreviewNavigation className="border-b p-2">
                  <WebPreviewNavigationButton tooltip="Reload" onClick={handleReload}>
                    <RefreshCw className="h-4 w-4" />
                  </WebPreviewNavigationButton>
                  <WebPreviewNavigationButton tooltip="Copy URL" onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                  </WebPreviewNavigationButton>
                  <WebPreviewNavigationButton tooltip="Open in new tab" onClick={handleOpen}>
                    <ExternalLink className="h-4 w-4" />
                  </WebPreviewNavigationButton>
                  <WebPreviewUrl placeholder="Enter URL..." />
                </WebPreviewNavigation>
                <WebPreviewBody className="w-full h-full border-0" onLoad={finishProgress} />
              </WebPreview>
            )}
          </div>
        </TabsContent>

        
      </Tabs>

      <DeployDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        defaultName={(project as any)?.deployment?.name}
        onConfirm={handleConfirmDeploy}
        isSubmitting={isDeploying}
      />
    </div>
  );
}


