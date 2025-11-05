 'use client';

import { useEffect, useRef, useState } from 'react';
import type { Terminal as XTermType } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

type TerminalWidgetProps = {
  sandboxId?: string
  className?: string
}

export default function TerminalWidget({ sandboxId, className }: TerminalWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initedRef = useRef(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current || !sandboxId || initedRef.current) return
    initedRef.current = true
    setIsLoading(true)

    let terminal: XTermType | null = null
    let socket: WebSocket | null = null
    let fitAddon: any = null
    let resizeObserver: ResizeObserver | null = null
    let cancelled = false

    Promise.all([
      import('@xterm/xterm').then(m => m.Terminal),
      import('@xterm/addon-fit').then(m => m.FitAddon),
      import('@xterm/addon-web-links').then(m => m.WebLinksAddon),
    ]).then(([Terminal, FitAddon, WebLinksAddon]) => {
      if (cancelled || !containerRef.current) return

      terminal = new Terminal({
        fontSize: 14,
        lineHeight: 1.45,
        cursorBlink: true,
        convertEol: true,
        fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
        theme: {
          background: '#ffffff',
          foreground: '#1f2937',
          cursor: '#111827',
          selectionBackground: '#e5e7eb',
          black: '#111827',
          red: '#ef4444',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#2563eb',
          magenta: '#d946ef',
          cyan: '#06b6d4',
          white: '#9ca3af',
          brightBlack: '#6b7280',
          brightRed: '#f87171',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#3b82f6',
          brightMagenta: '#e879f9',
          brightCyan: '#22d3ee',
          brightWhite: '#d1d5db',
        },
      })

      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())
      terminal.open(containerRef.current)
      fitAddon.fit()

      const cols = terminal.cols || 80
      const rows = terminal.rows || 24
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const base = (process.env.NEXT_PUBLIC_SERVER_WS_URL || `${protocol}://${window.location.host}`).replace(/\/$/, '')
      const wsUrl = `${base}/ws/pty?cols=${cols}&rows=${rows}&sandboxId=${sandboxId}`

      socket = new WebSocket(wsUrl)
      socket.binaryType = 'arraybuffer'

      socket.onopen = () => {
        if (cancelled) return
        setIsLoading(false)
        socket?.send(JSON.stringify({ type: 'init' }))
      }

      socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data)
            if (msg?.type === 'exit') terminal?.write(`\r\nProcess exited with code ${msg.exitCode}\r\n`)
            else if (msg?.type === 'error') terminal?.write(`\r\n[error] ${msg.message}\r\n`)
          } catch {
            terminal?.write(event.data)
          }
        } else if (event.data instanceof ArrayBuffer) {
          terminal?.write(new TextDecoder().decode(new Uint8Array(event.data)))
        }
      }

      socket.onclose = () => {
        if (!cancelled) setIsLoading(false)
        terminal?.write('\r\n[disconnected]\r\n')
      }
      socket.onerror = () => {
        if (!cancelled) setIsLoading(false)
        terminal?.write('\r\n[connection error]\r\n')
      }

      terminal.onData((data: string) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'input', data }))
        }
      })

      resizeObserver = new ResizeObserver(() => {
        if (!fitAddon || !terminal || !socket) return
        fitAddon.fit()
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }))
        }
      })
      resizeObserver.observe(containerRef.current)
    })

    return () => {
      cancelled = true
      initedRef.current = false
      resizeObserver?.disconnect()
      socket?.close()
      terminal?.dispose()
    }
  }, [sandboxId])

  return (
    <div className={`w-full h-full ${className || ''}`}>
      {sandboxId ? (
        <div className="relative w-full h-full">
          <div ref={containerRef} className="w-full h-full" />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center px-2">
              <div className="text-xs text-muted-foreground">Loading...</div>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center px-2">
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
      )}
    </div>
  )
}
