'use client';

import PreviewPanel from '@/components/preview-panel';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

type Props = {
  header: ReactNode;
  initStatus: 'idle' | 'initializing' | 'ready' | 'error';
  previewUrl?: string;
  onPreviewUrl?: (url: string | null) => void;
  className?: string;
};

export default function PreviewSection({ header, initStatus, previewUrl, onPreviewUrl, className }: Props) {
  return (
    <div className={cn('min-w-0 order-2 flex flex-col h-full bg-background p-2', className)}>
      <div className="flex-1 min-h-0 rounded-xl border shadow-sm overflow-hidden bg-background">
        {header}
        <div className="flex-1 min-h-0">
          <PreviewPanel initStatus={initStatus} previewUrl={previewUrl} onPreviewUrl={onPreviewUrl} />
        </div>
      </div>
    </div>
  );
}


