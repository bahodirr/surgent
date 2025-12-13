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
  const sandboxId = project?.sandbox?.id;
  const isReady = sandboxId && proxyHost && connected;
  const previewUrl = isReady ? `https://3000-${sandboxId}.${proxyHost}` : undefined;

  const [currentUrl, setCurrentUrl] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  useEffect(() => {
    onPreviewUrl?.(previewUrl ?? null);
  }, [previewUrl, onPreviewUrl]);

  useEffect(() => {
    if (!previewUrl) return;
    if (currentUrl) return;
    setCurrentUrl(previewUrl);
  }, [currentUrl, previewUrl]);

  const deployment = project?.deployment;
  const deploymentName = deployment?.name;
  const status = deployment?.status ?? '';

  const isDeployed = status === 'deployed';
  const isFailed = status === 'build_failed' || status === 'deploy_failed';
  const isInProgress = ['queued', 'starting', 'resuming', 'building', 'uploading'].includes(status);

  const dotColor = isDeployed ? 'bg-green-500' : isFailed ? 'bg-red-500' : isInProgress ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground/50';

  const handleConfirmDeploy = useCallback(async (name: string) => {
    if (!projectId || isDeploying) return;
    setIsDeploying(true);
    try {
      await deployProject.mutateAsync({ id: projectId, deployName: name });
      setIsDialogOpen(false);
    } catch {}
    setIsDeploying(false);
  }, [deployProject, isDeploying, projectId]);

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

        {/* Header actions */}
        <div className="flex items-center gap-3 px-3 shrink-0">
          {status && (
            <span className={cn("inline-flex items-center gap-1.5 text-xs capitalize", isFailed ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
              <span className={cn("h-2 w-2 rounded-full", dotColor)} />
              {status.replaceAll('_', ' ')}
            </span>
          )}

          {isDeployed ? (
            <div className="flex items-center gap-2">
              <Button size="sm" className="cursor-pointer" onClick={() => setIsDialogOpen(true)}>
                <Rocket className="h-4 w-4" /> Redeploy
              </Button>
              <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => deploymentName && window.open(`https://${deploymentName}.surgent.dev`, '_blank', 'noopener,noreferrer')}>
                <ExternalLink className="h-4 w-4" /> Open
              </Button>
            </div>
          ) : !isInProgress && (
            <Button size="sm" className="cursor-pointer" disabled={!projectId || isDeploying} onClick={() => setIsDialogOpen(true)}>
              <Rocket className="h-4 w-4" /> {isFailed ? 'Retry Deploy' : 'Deploy'}
            </Button>
          )}
        </div>
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
                <WebPreviewNavigationButton tooltip="Reload" onClick={() => setReloadKey(k => k + 1)}>
                  <RefreshCw className="h-4 w-4" />
                </WebPreviewNavigationButton>
                <WebPreviewNavigationButton tooltip="Copy URL" onClick={() => navigator.clipboard?.writeText(currentUrl || previewUrl || '').catch(() => {})}>
                  <Copy className="h-4 w-4" />
                </WebPreviewNavigationButton>
                <WebPreviewNavigationButton tooltip="Open in new tab" onClick={() => (currentUrl || previewUrl) && window.open(currentUrl || previewUrl, '_blank', 'noopener,noreferrer')}>
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
        defaultName={deploymentName}
        onConfirm={handleConfirmDeploy}
        isSubmitting={isDeploying}
      />
    </div>
  );
}
