'use client';

import { WebPreview, WebPreviewNavigation, WebPreviewUrl, WebPreviewBody, WebPreviewConsole, WebPreviewNavigationButton } from '@/components/ai-elements/web-preview';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Copy } from 'lucide-react';

interface PreviewPanelProps {
  initStatus: 'idle' | 'initializing' | 'ready' | 'error';
  previewUrl?: string;
  onPreviewUrl?: (url: string | null) => void;
}

export default function PreviewPanel({ initStatus, previewUrl, onPreviewUrl }: PreviewPanelProps) {
  const [currentUrl, setCurrentUrl] = useState(previewUrl || '');
  const [reloadCount, setReloadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Indeterminate feel: bump once, then wait for onLoad to complete
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

  // Kick off progress when preview becomes ready with a URL (initial load)
  useEffect(() => {
    if (initStatus === 'ready' && (previewUrl || currentUrl)) {
      startProgress();
    }
  }, [initStatus]);

  useEffect(() => () => clearProgressTimer(), [clearProgressTimer]);

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
            onUrlChange={(u) => { setCurrentUrl(u); onPreviewUrl?.(u || null); startProgress(); }}
            className="h-full border-0"
          >
            {/* Top loading bar */}
            <div className="absolute top-0 left-0 right-0 z-10 h-0.5">
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
      {/* Composer is now rendered by Conversati on in SplitView */}
    </div>
  );
}


