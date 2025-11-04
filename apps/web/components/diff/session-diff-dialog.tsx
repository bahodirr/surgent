"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FileDiff } from "@opencode-ai/sdk";
import DiffViewerWithSidebar from "@/components/diff/diff-viewer-with-sidebar";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  diffs?: FileDiff[];
};

export default function SessionDiffDialog({ open, onOpenChange, diffs }: Props) {
  if (!diffs?.length) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[95vw] sm:!max-w-[95vw] h-[85vh]">
        <DialogHeader>
          <DialogTitle>Session Changes</DialogTitle>
        </DialogHeader>
        <DiffViewerWithSidebar diffs={diffs} className="flex-1 min-h-0" />
      </DialogContent>
    </Dialog>
  );
}

