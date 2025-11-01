"use client";

import React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type TriggerTitle = {
  title: string;
  subtitle?: string;
  args?: string[];
  action?: React.ReactNode;
};

function isTriggerTitle(val: any): val is TriggerTitle {
  return val && typeof val === "object" && "title" in val && !(val instanceof Node);
}

export function BasicTool({
  trigger,
  children,
  pending,
  error,
}: {
  trigger: TriggerTitle | React.ReactNode;
  children?: React.ReactNode;
  pending?: boolean;
  error?: string;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="w-full">
        <div className="w-full flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0 flex items-center gap-2">
            {isTriggerTitle(trigger) ? (
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground/90">{trigger.title}</div>
                {trigger.subtitle ? (
                  <div className="truncate text-foreground/60">{trigger.subtitle}</div>
                ) : null}
                {trigger.args && trigger.args.length ? (
                  <div className="text-foreground/50">{trigger.args.join(" • ")}</div>
                ) : null}
              </div>
            ) : (
              trigger
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pending ? <span className="text-xs text-amber-600">Pending</span> : null}
            {error ? <span className="text-xs text-red-600">{error.replace("Error: ", "")}</span> : null}
            {isTriggerTitle(trigger) ? trigger.action : null}
          </div>
        </div>
      </CollapsibleTrigger>
      {children ? (
        <CollapsibleContent className="mt-2 border-l pl-3 border-border">
          {children}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}


