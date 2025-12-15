"use client";

import { WebPreview, WebPreviewNavigation, WebPreviewUrl, WebPreviewBody, WebPreviewNavigationButton } from '@/components/agent/web-preview';
import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Copy, X, Database } from 'lucide-react';
import type { FileDiff } from "@opencode-ai/sdk";
import { useConvexDashboardQuery, type ConvexDashboardCredentials } from '@/queries/projects';
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

  useEffect(() => {
    onPreviewUrl?.(previewUrl ?? null);
  }, [previewUrl, onPreviewUrl]);

  useEffect(() => {
    if (!previewUrl) return;
    if (currentUrl) return;
    setCurrentUrl(previewUrl);
  }, [currentUrl, previewUrl]);


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

    </div>
  );
}
