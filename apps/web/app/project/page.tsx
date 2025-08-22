"use client";

import SplitView from '@/components/split-view';
import { useSearchParams } from 'next/navigation';

export default function ProjectPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id') || undefined;
  return <SplitView projectId={projectId} />;
}