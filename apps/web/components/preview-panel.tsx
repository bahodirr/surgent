"use client";

import { WebPreview, WebPreviewNavigation, WebPreviewUrl, WebPreviewBody, WebPreviewNavigationButton } from '@/components/agent/web-preview';
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Copy, Rocket, X } from 'lucide-react';
import type { FileDiff } from "@opencode-ai/sdk";
import { useDeployProject } from '@/queries/projects';
import { Button } from '@/components/ui/button';
import DeployDialog from '@/components/deploy-dialog';
import DiffView from '@/components/diff/diff-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSandbox } from '@/hooks/use-sandbox';

export interface PreviewTab {
  id: string;
  type: 'preview' | 'changes';
  title: string;
  diffs?: FileDiff[];
  messageId?: string;
}

const DEFAULT_TABS: PreviewTab[] = [{ id: 'preview', type: 'preview', title: 'Preview' }];

interface PreviewPanelProps {
  projectId?: string;
  project?: any;
  onPreviewUrl?: (url: string | null) => void;
  tabs?: PreviewTab[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
}

export default function PreviewPanel({ projectId, project, onPreviewUrl, tabs = DEFAULT_TABS, activeTabId = 'preview', onTabChange, onCloseTab }: PreviewPanelProps) {
  const deployProject = useDeployProject();
  const connected = useSandbox(s => s.connected);

  const proxyHost = process.env.NEXT_PUBLIC_PROXY_URL;
  const sandboxId = (project as any)?.sandbox?.id;
  const isReady = sandboxId && proxyHost && connected;
  const previewUrl = isReady ? `https://3000-${sandboxId}.${proxyHost}` : undefined;

  useEffect(() => {
    if (!onPreviewUrl) return;
    onPreviewUrl(previewUrl ?? null);
  }, [previewUrl, onPreviewUrl]);

  const [currentUrl, setCurrentUrl] = useState(previewUrl || '');
  const [reloadKey, setReloadKey] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  const handleReload = useCallback(() => setReloadKey(k => k + 1), []);

  const handleCopy = useCallback(() => {
    const url = currentUrl || previewUrl || '';
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
  }, [currentUrl, previewUrl]);

  const handleOpenDeployment = useCallback(() => {
    const name = project?.deployment?.name;
    if (!name) return;
    window.open(`https://${name}.surgent.dev`, '_blank', 'noopener,noreferrer');
  }, [project]);

  const handleOpenPreview = useCallback(() => {
    const url = currentUrl || previewUrl;
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [currentUrl, previewUrl]);

  const handleConfirmDeploy = useCallback(async (sanitizedName: string) => {
    if (!projectId || isDeploying) return;
    setIsDeploying(true);
    try {
      await deployProject.mutateAsync({ id: projectId, deployName: sanitizedName });
      setIsDialogOpen(false);
    } catch {}
    setIsDeploying(false);
  }, [deployProject, isDeploying, projectId]);

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
              disabled={!project?.deployment?.name}
              onClick={handleOpenDeployment}
            >
              <ExternalLink className="h-4 w-4" /> Open
            </Button>
          </div>
        ) : ['queued','starting','resuming','building','uploading'].includes(String((project as any)?.deployment?.status || '')) ? (
          <Button
            size="sm"
            variant="secondary"
            className="cursor-pointer"
            disabled={!project?.deployment?.name}
            onClick={handleOpenDeployment}
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

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="h-full flex flex-col relative">
      {/* Tab bar */}
      <div className="flex h-10 items-stretch border-b bg-muted/30 shrink-0">
        <div className="flex flex-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={cn(
                "group flex items-center gap-2 px-3 text-sm border-r transition-colors",
                activeTabId === tab.id ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <span className="truncate max-w-32">{tab.title}</span>
              {tab.type !== 'preview' && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); onCloseTab?.(tab.id); }}
                  className="p-0.5 rounded hover:bg-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-3" />
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center px-3 shrink-0">{headerActions}</div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab?.type === 'preview' ? (
          !isReady ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <div className="h-8 w-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                <span>Starting sandbox...</span>
              </div>
            </div>
          ) : (
            <WebPreview
              key={`${previewUrl}:${reloadKey}`}
              defaultUrl={previewUrl || ''}
              onUrlChange={(u) => { setCurrentUrl(u); onPreviewUrl?.(u || null); }}
              className="h-full border-0"
            >
              <WebPreviewNavigation className="border-b p-2">
                <WebPreviewNavigationButton tooltip="Reload" onClick={handleReload}>
                  <RefreshCw className="h-4 w-4" />
                </WebPreviewNavigationButton>
                <WebPreviewNavigationButton tooltip="Copy URL" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                </WebPreviewNavigationButton>
                <WebPreviewNavigationButton tooltip="Open in new tab" onClick={handleOpenPreview}>
                  <ExternalLink className="h-4 w-4" />
                </WebPreviewNavigationButton>
                <WebPreviewUrl placeholder="Enter URL..." />
              </WebPreviewNavigation>
              <WebPreviewBody className="w-full h-full border-0" />
            </WebPreview>
          )
        ) : activeTab?.diffs?.length ? (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {activeTab.diffs.map((d, i) => (
                <DiffView key={i} before={d.before} after={d.after} path={d.file} collapseUnchanged contextLines={3} />
              ))}
            </div>
          </ScrollArea>
        ) : null}
      </div>

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


