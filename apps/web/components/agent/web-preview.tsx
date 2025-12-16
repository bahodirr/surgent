'use client';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  MonitorIcon,
  RefreshCwIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

export type WebPreviewContextValue = {
  url: string;
  setUrl: (url: string) => void;
  consoleOpen: boolean;
  setConsoleOpen: (open: boolean) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  refresh: () => void;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
};

const WebPreviewContext = createContext<WebPreviewContextValue | null>(null);

const useWebPreview = () => {
  const context = useContext(WebPreviewContext);
  if (!context) {
    throw new Error('WebPreview components must be used within a WebPreview');
  }
  return context;
};

export type WebPreviewProps = ComponentProps<'div'> & {
  defaultUrl?: string;
  onUrlChange?: (url: string) => void;
};

export const WebPreview = ({
  className,
  children,
  defaultUrl = '',
  onUrlChange,
  ...props
}: WebPreviewProps) => {
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [nav, setNav] = useState(() => ({
    history: [defaultUrl],
    index: 0,
  }));
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const url = nav.history[nav.index] ?? '';

  useEffect(() => {
    onUrlChange?.(url);
  }, [url, onUrlChange]);

  const setUrl = (nextUrl: string) => {
    setNav((prev) => {
      const current = prev.history[prev.index] ?? '';
      if (nextUrl === current) return prev;

      const history = [...prev.history.slice(0, prev.index + 1), nextUrl];
      return { history, index: history.length - 1 };
    });
  };

  const canGoBack = nav.index > 0;
  const canGoForward = nav.index < nav.history.length - 1;

  const goBack = () => {
    setNav((prev) => (prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev));
  };

  const goForward = () => {
    setNav((prev) =>
      prev.index < prev.history.length - 1 ? { ...prev, index: prev.index + 1 } : prev
    );
  };

  const refresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  };

  const contextValue: WebPreviewContextValue = {
    url,
    setUrl,
    consoleOpen,
    setConsoleOpen,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    refresh,
    iframeRef,
  };

  return (
    <WebPreviewContext.Provider value={contextValue}>
      <div
        className={cn('flex size-full flex-col border bg-card', className)}
        {...props}
      >
        {children}
      </div>
    </WebPreviewContext.Provider>
  );
};

export type WebPreviewNavigationProps = ComponentProps<'div'>;

export const WebPreviewNavigation = ({
  className,
  children,
  ...props
}: WebPreviewNavigationProps) => (
  <div
    className={cn('flex items-center gap-1 border-b px-2 py-1.5', className)}
    {...props}
  >
    {children}
  </div>
);

export const WebPreviewNavButtons = () => {
  const { canGoBack, canGoForward, goBack, goForward, refresh, url } =
    useWebPreview();

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={!canGoBack}
              onClick={goBack}
              className={cn(
                'flex size-7 items-center justify-center rounded-md transition-colors',
                !canGoBack
                  ? 'opacity-30'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              aria-label="Go back"
            >
              <ChevronLeftIcon size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Go back</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={!canGoForward}
              onClick={goForward}
              className={cn(
                'flex size-7 items-center justify-center rounded-md transition-colors',
                !canGoForward
                  ? 'opacity-30'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              aria-label="Go forward"
            >
              <ChevronRightIcon size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Go forward</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={refresh}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Refresh page"
            >
              <RefreshCwIcon size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex size-7 items-center justify-center rounded-md transition-colors',
                url
                  ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  : 'pointer-events-none opacity-30'
              )}
              aria-label="Open in new tab"
            >
              <ExternalLinkIcon size={14} />
            </a>
          </TooltipTrigger>
          <TooltipContent>Open in new tab</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export type WebPreviewNavigationButtonProps = ComponentProps<typeof Button> & {
  tooltip?: string;
};

export const WebPreviewNavigationButton = ({
  onClick,
  disabled,
  tooltip,
  children,
  ...props
}: WebPreviewNavigationButtonProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="h-8 w-8 p-0 hover:text-foreground"
          disabled={disabled}
          onClick={onClick}
          size="sm"
          variant="ghost"
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export type WebPreviewUrlProps = ComponentProps<'input'>;

const getPathname = (url: string) => {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '/';
  }
};

export const WebPreviewUrl = ({ className, ...props }: WebPreviewUrlProps) => {
  const { url, setUrl } = useWebPreview();
  const [path, setPath] = useState(() => getPathname(url));

  useEffect(() => {
    setPath(getPathname(url));
  }, [url]);

  const handleNavigate = () => {
    try {
      const newUrl = new URL(url);
      newUrl.pathname = path.startsWith('/') ? path : '/' + path;
      setUrl(newUrl.toString());
    } catch {
      // ignore invalid url
    }
  };

  return (
    <div
      className={cn(
        'flex h-7 w-full max-w-[280px] items-center rounded-lg border border-border/50 bg-muted/50 px-2.5',
        className
      )}
    >
      <input
        className="w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/50"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
        placeholder="/"
        aria-label="App preview path"
        type="text"
        {...props}
      />
    </div>
  );
};

export type WebPreviewBodyProps = ComponentProps<'iframe'> & {
  overlay?: ReactNode;
};

export const WebPreviewBody = ({
  className,
  overlay,
  src,
  ...props
}: WebPreviewBodyProps) => {
  const { url, iframeRef } = useWebPreview();

  return (
    <div className="relative flex-1">
      <iframe
        ref={iframeRef}
        className={cn('size-full', className)}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-presentation allow-pointer-lock allow-storage-access-by-user-activation allow-downloads"
        allow="autoplay; camera; clipboard-read; clipboard-write; geolocation; display-capture; encrypted-media; fullscreen; gamepad; gyroscope; magnetometer; microphone; midi; payment; usb; bluetooth; hid; serial; xr-spatial-tracking; screen-wake-lock; idle-detection; publickey-credentials-get; local-fonts; window-management"
        src={(src ?? url) || undefined}
        title="Preview"
        {...props}
      />
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          {overlay}
        </div>
      ) : null}
    </div>
  );
};

export type WebPreviewConsoleProps = ComponentProps<'div'> & {
  logs?: Array<{
    level: 'log' | 'warn' | 'error';
    message: string;
    timestamp: Date;
  }>;
};

export const WebPreviewConsole = ({
  className,
  logs = [],
  children,
  ...props
}: WebPreviewConsoleProps) => {
  const { consoleOpen, setConsoleOpen } = useWebPreview();

  return (
    <Collapsible
      className={cn('border-t bg-muted/50 font-mono text-sm', className)}
      onOpenChange={setConsoleOpen}
      open={consoleOpen}
      {...props}
    >
      <CollapsibleTrigger asChild>
        <Button
          className="flex w-full items-center justify-between p-4 text-left font-medium hover:bg-muted/50"
          variant="ghost"
        >
          Console
          <ChevronDownIcon
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              consoleOpen && 'rotate-180'
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'px-4 pb-4',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in'
        )}
      >
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-muted-foreground">No console output</p>
          ) : (
            logs.map((log, index) => (
              <div
                className={cn(
                  'text-xs',
                  log.level === 'error' && 'text-destructive',
                  log.level === 'warn' && 'text-yellow-600',
                  log.level === 'log' && 'text-foreground'
                )}
                key={`${log.timestamp.getTime()}-${index}`}
              >
                <span className="text-muted-foreground">
                  {log.timestamp.toLocaleTimeString()}
                </span>{' '}
                {log.message}
              </div>
            ))
          )}
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
