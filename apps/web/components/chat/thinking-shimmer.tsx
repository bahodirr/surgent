'use client';

export function ThinkingShimmer() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5">
        <div className="h-2 w-2 rounded-full bg-foreground/40 animate-[pulse_1.4s_ease-in-out_0s_infinite]" />
        <div className="h-2 w-2 rounded-full bg-foreground/40 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
        <div className="h-2 w-2 rounded-full bg-foreground/40 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
      </div>
      <span className="text-xs text-foreground/60">Thinking…</span>
    </div>
  );
}

