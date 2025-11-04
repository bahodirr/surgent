'use client';

import SplitView from '@/components/split-view';

export default function ProjectPage({ params }: { params: { id: string } }) {
  return <SplitView projectId={params.id} />;
}

