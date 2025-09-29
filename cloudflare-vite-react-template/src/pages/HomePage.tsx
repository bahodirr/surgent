// Home page of the app, Currently a demo page for demonstration.
// Please rewrite this file to implement your own logic. Do not replace or delete it, simply rewrite this HomePage.tsx file.
import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Toaster, toast } from '@/components/ui/sonner'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

// Timer store: independent slice with a clear, minimal API, for demonstration
type TimerState = {
  isRunning: boolean;
  elapsedMs: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  tick: (deltaMs: number) => void;
}

const useTimerStore = create<TimerState>((set) => ({
  isRunning: false,
  elapsedMs: 0,
  start: () => set({ isRunning: true }),
  pause: () => set({ isRunning: false }),
  reset: () => set({ elapsedMs: 0, isRunning: false }),
  tick: (deltaMs) => set((s) => ({ elapsedMs: s.elapsedMs + deltaMs })),
}))

// Counter store: separate slice to showcase multiple stores without coupling
type CounterState = {
  count: number;
  inc: () => void;
  reset: () => void;
}

const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}))

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function HomePage() {
  // Select only what is needed to avoid unnecessary re-renders
  const { isRunning, elapsedMs } = useTimerStore(
    useShallow((s) => ({ isRunning: s.isRunning, elapsedMs: s.elapsedMs })),
  )
  const start = useTimerStore((s) => s.start)
  const pause = useTimerStore((s) => s.pause)
  const resetTimer = useTimerStore((s) => s.reset)
  const count = useCounterStore((s) => s.count)
  const inc = useCounterStore((s) => s.inc)
  const resetCount = useCounterStore((s) => s.reset)

  // Drive the timer only while running; avoid update-depth issues with a scoped RAF
  useEffect(() => {
    if (!isRunning) return
    let raf = 0
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      const delta = now - last
      last = now
      // Read store API directly to keep effect deps minimal and stable
      useTimerStore.getState().tick(delta)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isRunning])

  const onPleaseWait = () => {
    inc()
    if (!isRunning) {
      start()
      toast.success('Building your app…', {
        description: 'Hang tight, we\'re setting everything up.',
      })
    } else {
      pause()
      toast.info('Taking a short pause', {
        description: 'We\'ll continue shortly.',
      })
    }
  }

  const formatted = formatDuration(elapsedMs)

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4 overflow-hidden relative">
      <ThemeToggle />

      <div className="absolute inset-0 bg-gradient-rainbow opacity-10 dark:opacity-20" />
      
      <div className="text-center space-y-8 relative z-10 animate-fade-in">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-primary floating">
            <Sparkles className="w-8 h-8 text-white rotating" />
          </div>
        </div>

        <h1 className="text-5xl md:text-7xl font-display font-bold text-balance leading-tight">
          Creating your <span className="text-gradient">app</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto text-pretty">
          Your application would be ready soon.
        </p>

        <div className="flex justify-center gap-4">
          <Button 
            size="lg"
            onClick={onPleaseWait}
            className="btn-gradient px-8 py-4 text-lg font-semibold hover:-translate-y-0.5 transition-all duration-200"
            aria-live="polite"
          >
            Please Wait
          </Button>
        </div>

        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <div>
            Time elapsed: <span className="font-medium tabular-nums text-foreground">{formatted}</span>
          </div>
          <div>
            Coins: <span className="font-medium tabular-nums text-foreground">{count}</span>
          </div>
        </div>

        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { resetTimer(); resetCount(); toast('Reset complete') }}>
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={() => { inc(); toast('Coin added') }}>
            Add Coin
          </Button>
        </div>
      </div>

      <footer className="absolute bottom-8 text-center text-muted-foreground/80">
        <p>Powered by Cloudflare</p>
      </footer>

      <Toaster richColors closeButton />
    </main>
  )
}
