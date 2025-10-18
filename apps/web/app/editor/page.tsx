"use client";

import { Id } from '@repo/backend';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import EditorView from '@/components/editor-view';

export default function EditorPage() {
  const projectId = 'k176sws7xpn9z9568d10mzw8797sn9dm' as Id<'projects'>; // TODO: Get from route

  return (
    <SidebarProvider>
      <AppSidebar projectId={projectId} />
      <EditorView projectId={projectId} />
    </SidebarProvider>
  );
}
