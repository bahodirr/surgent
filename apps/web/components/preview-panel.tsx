'use client';

import { WebPreview, WebPreviewNavigation, WebPreviewUrl, WebPreviewBody, WebPreviewConsole, WebPreviewNavigationButton } from '@/components/ai-elements/web-preview';
import { useCallback, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Copy } from 'lucide-react';

interface PreviewPanelProps {
  initStatus: 'idle' | 'initializing' | 'ready' | 'error';
  previewUrl?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function PreviewPanel({ initStatus, previewUrl, onPreviewUrl }: PreviewPanelProps) {
  const [currentUrl, setCurrentUrl] = useState(previewUrl || '');
  const [reloadCount, setReloadCount] = useState(0);

  const webPreviewKey = useMemo(() => `${previewUrl ?? 'empty'}:${reloadCount}`, [previewUrl, reloadCount]);

  const handleReload = useCallback(() => setReloadCount((c) => c + 1), []);
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

  return (
    <div className="h-full flex flex-col relative">
      
      <div className="flex-1 bg-background">
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
              <WebPreviewNavigationButton tooltip="Open in new tab" onClick={handleOpen}>
                <ExternalLink className="h-4 w-4" />
              </WebPreviewNavigationButton>
              <WebPreviewUrl placeholder="Enter URL..." />
            </WebPreviewNavigation>
            <WebPreviewBody className="w-full h-full border-0" />
          </WebPreview>

        )}
      </div>
      {/* Composer is now rendered by Conversation in SplitView */}
    </div>
  );
}


