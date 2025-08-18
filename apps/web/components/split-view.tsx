'use client';

import { useState } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import TerminalWrapper from './terminal-wrapper';
import Conversation from './conversation';

export default function SplitView() {
  const [showTerminal, setShowTerminal] = useState(false);

  return (
    <div className="h-screen w-full bg-background">
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full rounded-lg border"
      >
        <ResizablePanel defaultSize={30} minSize={30}>
          <div className="h-full flex flex-col">
            <div className="border-b bg-muted/50 px-4 py-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">Workspace</h3>
              <div className="flex items-center gap-2">
                <Label htmlFor="view-switch" className="text-xs text-muted-foreground cursor-pointer">
                  Terminal
                </Label>
                <Switch
                  id="view-switch"
                  checked={!showTerminal}
                  onCheckedChange={(checked) => setShowTerminal(!checked)}
                  className="data-[state=checked]:bg-primary"
                />
                <Label htmlFor="view-switch" className="text-xs text-muted-foreground cursor-pointer">
                  Chat
                </Label>
              </div>
            </div>
            
            {showTerminal ? (
              <div className="flex-1 overflow-hidden">
                <TerminalWrapper />
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <Conversation />
              </div>
            )}
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={70} minSize={50}>
          <div className="h-full flex flex-col">
            <div className="border-b bg-muted px-4 py-2">
              <h3 className="text-sm font-medium">Preview</h3>
            </div>
            <div className="flex-1 bg-background">
              <iframe
                src="https://dizipro.org"
                className="w-full h-full border-0"
                title="Preview"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}