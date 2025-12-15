"use client";

import { memo, useEffect, useRef } from 'react';

const EMBED_ORIGIN = 'https://dashboard-embedded.convex.dev';

export interface ConvexCredentials {
  adminKey: string;
  deploymentName: string;
  deploymentUrl: string;
}

interface EmbeddedDashboardProps {
  credentials: ConvexCredentials;
  path?: string;
}

export const EmbeddedDashboard = memo(function EmbeddedDashboard({
  credentials,
  path = 'data',
}: EmbeddedDashboardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { deploymentUrl, adminKey, deploymentName } = credentials;

  const iframeSrc = `${EMBED_ORIGIN}/${path}`;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: only accept messages from Convex embed origin
      if (event.origin !== EMBED_ORIGIN) return;
      
      // Only respond to the expected credential request
      if (event.data?.type !== 'dashboard-credentials-request') return;
      
      if (!deploymentUrl || !adminKey || !deploymentName) return;

      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;

      // Security: use explicit targetOrigin instead of '*'
      iframe.contentWindow.postMessage(
        {
          type: 'dashboard-credentials',
          adminKey,
          deploymentUrl,
          deploymentName,
        },
        EMBED_ORIGIN
      );
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [deploymentUrl, adminKey, deploymentName]);

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      className="w-full h-full border-0 bg-background"
      allow="clipboard-write"
    />
  );
});

