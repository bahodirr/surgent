"use client";

import { WebPreview, WebPreviewNavigation, WebPreviewUrl, WebPreviewBody, WebPreviewNavigationButton } from '@/components/agent/web-preview';
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Copy, Rocket, X, Database } from 'lucide-react';
import type { FileDiff } from "@opencode-ai/sdk";
import { useDeployProject, useConvexDashboardQuery, type ConvexDashboardCredentials } from '@/queries/projects';
import { Button } from '@/components/ui/button';
import DeployDialog from '@/components/deploy-dialog';
import DiffView from '@/components/diff/diff-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSandbox } from '@/hooks/use-sandbox';
import { EmbeddedDashboard } from '@/components/agent/convex-dashboard';

export interface PreviewTab {
  id: string;
  type: 'preview' | 'changes' | 'convex';
  title: string;
  diffs?: FileDiff[];
  messageId?: string;
  convexPath?: string;
}

const DEFAULT_TABS: PreviewTab[] = [{ id: 'preview', type: 'preview', title: 'Preview' }];

// Loading spinner component
function LoadingState({ icon: Icon, message }: { icon?: typeof Database; message: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        {Icon ? (
          <Icon className="h-8 w-8 animate-pulse" />
        ) : (
          <div className="h-8 w-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}

// Tab content components
function PreviewContent({ 
  previewUrl, 
  reloadKey, 
  onReload, 
  onUrlChange 
}: { 
  previewUrl: string; 
  reloadKey: number; 
  onReload: () => void; 
  onUrlChange: (url: string) => void;
}) {
  return (
    <WebPreview
      key={`${previewUrl}:${reloadKey}`}
      defaultUrl={previewUrl}
      onUrlChange={onUrlChange}
      className="h-full border-0"
    >
      <WebPreviewNavigation className="border-b p-2">
        <WebPreviewNavigationButton tooltip="Reload" onClick={onReload}>
          <RefreshCw className="h-4 w-4" />
        </WebPreviewNavigationButton>
        <WebPreviewNavigationButton 
          tooltip="Copy URL" 
          onClick={() => navigator.clipboard?.writeText(previewUrl).catch(() => {})}
        >
          <Copy className="h-4 w-4" />
        </WebPreviewNavigationButton>
        <WebPreviewNavigationButton 
          tooltip="Open in new tab" 
          onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="h-4 w-4" />
        </WebPreviewNavigationButton>
        <WebPreviewUrl placeholder="Enter URL..." />
      </WebPreviewNavigation>
      <WebPreviewBody className="w-full h-full border-0" />
    </WebPreview>
  );
}

function ConvexContent({ 
  credentials, 
  isLoading, 
  path 
}: { 
  credentials?: ConvexDashboardCredentials; 
  isLoading: boolean; 
  path?: string;
}) {
  if (isLoading) {
    return <LoadingState icon={Database} message="Loading Convex dashboard..." />;
  }
  
  if (!credentials) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-sm text-muted-foreground">Convex not configured for this project</span>
      </div>
    );
  }
  
  return <EmbeddedDashboard credentials={credentials} path={path || 'data'} />;
}

function ChangesContent({ diffs }: { diffs: FileDiff[] }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {diffs.map((d, i) => (
          <DiffView 
            key={i} 
            before={d.before} 
            after={d.after} 
            path={d.file} 
            collapseUnchanged 
            contextLines={3} 
          />
        ))}
      </div>
    </ScrollArea>
  );
}

// Tab button component
function TabButton({ 
  tab, 
  isActive, 
  onSelect, 
  onClose 
}: { 
  tab: PreviewTab; 
  isActive: boolean; 
  onSelect: () => void; 
  onClose?: () => void;
}) {
  const isClosable = tab.type !== 'preview' && tab.type !== 'convex';
  
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-2 px-3 text-sm border-r transition-colors",
        isActive ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50"
      )}
    >
      <span className="truncate max-w-32">{tab.title}</span>
      {isClosable && onClose && (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-0.5 rounded hover:bg-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  );
}

// Deployment status indicator
function DeploymentStatus({ status }: { status: string }) {
  if (!status) return null;
  
  const isDeployed = status === 'deployed';
  const isFailed = status === 'build_failed' || status === 'deploy_failed';
  const isInProgress = ['queued', 'starting', 'resuming', 'building', 'uploading'].includes(status);
  
  const dotColor = isDeployed 
    ? 'bg-green-500' 
    : isFailed 
      ? 'bg-red-500' 
      : isInProgress 
        ? 'bg-blue-500 animate-pulse' 
        : 'bg-muted-foreground/50';

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-xs capitalize",
      isFailed ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
    )}>
      <span className={cn("h-2 w-2 rounded-full", dotColor)} />
      {status.replaceAll('_', ' ')}
    </span>
  );
}

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
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const hasConvex = Boolean((project?.metadata as any)?.convex);
  const isConvexTabActive = activeTab?.type === 'convex';
  
  const { data: convexCredentials, isLoading: convexLoading } = useConvexDashboardQuery(
    projectId,
    hasConvex && isConvexTabActive
  );

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

  const handleConfirmDeploy = useCallback(async (name: string) => {
    if (!projectId || isDeploying) return;
    setIsDeploying(true);
    try {
      await deployProject.mutateAsync({ id: projectId, deployName: name });
      setIsDialogOpen(false);
    } catch {}
    setIsDeploying(false);
  }, [deployProject, isDeploying, projectId]);

  const openDeployedSite = () => {
    if (deploymentName) {
      window.open(`https://${deploymentName}.surgent.dev`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Tab bar */}
      <div className="flex h-10 items-stretch border-b bg-muted/30 shrink-0">
        <div className="flex flex-1 overflow-x-auto">
          {tabs.map(tab => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={activeTabId === tab.id}
              onSelect={() => onTabChange?.(tab.id)}
              onClose={onCloseTab ? () => onCloseTab(tab.id) : undefined}
            />
          ))}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-3 px-3 shrink-0">
          <DeploymentStatus status={status} />

          {isDeployed ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setIsDialogOpen(true)}>
                <Rocket className="h-4 w-4" /> Redeploy
              </Button>
              <Button size="sm" variant="secondary" onClick={openDeployedSite}>
                <ExternalLink className="h-4 w-4" /> Open
              </Button>
            </div>
          ) : !isInProgress && (
            <Button 
              size="sm" 
              disabled={!projectId || isDeploying} 
              onClick={() => setIsDialogOpen(true)}
            >
              <Rocket className="h-4 w-4" /> {isFailed ? 'Retry Deploy' : 'Deploy'}
            </Button>
          )}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab?.type === 'preview' && (
          isReady && previewUrl ? (
            <PreviewContent
              previewUrl={previewUrl}
              reloadKey={reloadKey}
              onReload={() => setReloadKey(k => k + 1)}
              onUrlChange={(u) => { setCurrentUrl(u); onPreviewUrl?.(u || null); }}
            />
          ) : (
            <LoadingState message="Starting sandbox..." />
          )
        )}
        
        {activeTab?.type === 'convex' && (
          <ConvexContent
            credentials={convexCredentials}
            isLoading={convexLoading}
            path={activeTab.convexPath}
          />
        )}
        
        {activeTab?.type === 'changes' && activeTab.diffs?.length && (
          <ChangesContent diffs={activeTab.diffs} />
        )}
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
