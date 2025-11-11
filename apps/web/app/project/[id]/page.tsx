'use client';

import SplitView from '@/components/split-view';
import { use } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const initial = searchParams.get('initial') || undefined;
  return <SplitView projectId={id} initialPrompt={initial} />;
}

