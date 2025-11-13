"use client";

import { WebPreview, WebPreviewNavigation, WebPreviewUrl, WebPreviewBody, WebPreviewNavigationButton } from '@/components/agent/web-preview';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Copy, Rocket } from 'lucide-react';
import { useDeployProject } from '@/queries/projects';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import DeployDialog from '@/components/deploy-dialog';
 
interface PreviewPanelProps {
  projectId?: string;
  project?: any;
  onPreviewUrl?: (url: string | null) => void;
}

export default function PreviewPanel({ projectId, project, onPreviewUrl }: PreviewPanelProps) {
  const deployProject = useDeployProject();

  const proxyHost = process.env.NEXT_PUBLIC_PROXY_URL;
  const sandboxId = (project as any)?.sandbox?.id;
  const hasSandbox = Boolean(sandboxId && proxyHost);
  const isReady = hasSandbox;
  const previewUrl = isReady ? `https://3000-${sandboxId}.${proxyHost}` : undefined;
  const initStatus: 'idle' | 'initializing' | 'ready' | 'error' = isReady ? 'ready' : 'initializing';
  

  useEffect(() => {
    if (!onPreviewUrl) return;
    onPreviewUrl(previewUrl ?? null);
  }, [previewUrl, onPreviewUrl]);

  const [currentUrl, setCurrentUrl] = useState(previewUrl || '');
  const [reloadCount, setReloadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [showInitialLoader, setShowInitialLoader] = useState(true);

  const webPreviewKey = useMemo(() => `${previewUrl ?? 'empty'}:${reloadCount}`, [previewUrl, reloadCount]);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const clearLoadGuard = useCallback(() => {
    if (loadGuardRef.current) {
      clearTimeout(loadGuardRef.current);
      loadGuardRef.current = null;
    }
  }, []);

  const startProgress = useCallback(() => {
    setIsLoading(true);
    setProgress(30);
    clearProgressTimer();
    progressTimerRef.current = setTimeout(() => setProgress(70), 400);
    clearLoadGuard();
    loadGuardRef.current = setTimeout(() => {
      setIsLoading(false);
    }, 10000);
  }, [clearProgressTimer, clearLoadGuard]);

  const finishProgress = useCallback(() => {
    setProgress(100);
    clearProgressTimer();
    clearLoadGuard();
    setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
    }, 250);
  }, [clearProgressTimer, clearLoadGuard]);

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
    const url = `https://${project.deployment.name}.surgent.dev`
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [project]);

  const handleConfirmDeploy = useCallback(async (sanitizedName: string) => {
    if (!projectId || isDeploying) return;
    setIsDeploying(true);
    try {
      await deployProject.mutateAsync({ id: projectId, deployName: sanitizedName });
      setIsDialogOpen(false);
    } catch {}
    setIsDeploying(false);
  }, [deployProject, isDeploying, projectId]);

  // Show loader for 5 seconds on initial load
  useEffect(() => {
    if (initStatus === 'ready' && (previewUrl || currentUrl)) {
      startProgress();
      const timer = setTimeout(() => {
        setShowInitialLoader(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [initStatus, previewUrl, currentUrl, startProgress]);

  useEffect(() => () => {
    clearProgressTimer();
    clearLoadGuard();
  }, [clearProgressTimer, clearLoadGuard]);

  // Removed favicon ping and auto-recovery to avoid refresh loops

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
              disabled={!`https://${project.deployment.name}.surgent.dev`}
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
          <span className="text-sm font-medium">Preview</span>
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
                onUrlChange={(u) => {
                  setCurrentUrl(u);
                  onPreviewUrl?.(u || null);
                  startProgress();
                }}
                className="h-full border-0"
              >
                
                <WebPreviewNavigation className="border-b p-2 relative">
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
                  <div className="absolute bottom-0 left-0 right-0 h-0.5">
                    <div
                      className="h-full bg-primary transition-[width] duration-200 ease-out"
                      style={{ width: isLoading ? `${progress}%` : '0%' }}
                    />
                  </div>
                </WebPreviewNavigation>
                <WebPreviewBody
                  className="w-full h-full border-0"
                  onLoad={finishProgress}
                  overlay={
                    showInitialLoader ? (
                      <div className="flex size-full flex-col items-center justify-center gap-4 bg-background/95 px-6 text-center backdrop-blur-md pointer-events-auto">
                        <div className="h-12 w-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <div className="flex flex-col gap-2">
                          <div className="text-base font-semibold text-foreground">
                            Loading preview...
                          </div>
                        </div>
                      </div>
                    ) : null
                  }
                />
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


