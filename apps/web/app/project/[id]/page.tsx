'use client';

import SplitView from '@/components/split-view';
import { use } from 'react';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SplitView projectId={id} />;
}

