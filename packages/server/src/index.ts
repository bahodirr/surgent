import { Hono } from 'hono'
import { upgradeWebSocket, websocket } from 'hono/bun'
import { Daytona, type DaytonaConfig, type Sandbox } from '@daytonaio/sdk'

const port = Number(process.env.PORT ?? '5050')

type WsData = {
  ptyId?: string
  sandbox?: Sandbox
  ptyHandle?: PtyHandle
  ownedSandbox: boolean
}

type PtyHandle = {
  sendInput(input: string): Promise<void>
  wait(): Promise<any>
  waitForConnection(): Promise<void>
  kill(): Promise<void>
}

function createDaytona(): Daytona {
  const cfg: DaytonaConfig = {}
  if (process.env.DAYTONA_API_KEY) cfg.apiKey = process.env.DAYTONA_API_KEY
  if (process.env.DAYTONA_API_URL) cfg.apiUrl = process.env.DAYTONA_API_URL
  if (process.env.DAYTONA_ORG_ID) cfg.organizationId = process.env.DAYTONA_ORG_ID;
  return new Daytona(cfg)
}

function logDaytonaError(op: string, err: unknown) {
  const anyErr = err as any
  console.error('[daytona]', op, anyErr?.message || anyErr)
}

async function initPtyForConnection(
  data: WsData,
  params: { sandboxId?: string; cols: number; rows: number },
  onData: (chunk: Uint8Array) => void
) {
  const daytona = createDaytona()

  const { sandboxId, cols, rows } = params

  const sandbox = await daytona.get(sandboxId as string)
    const state = (sandbox.state || '').toString().toUpperCase()
    if (state === 'STOPPED' || state === 'ARCHIVED') {
      await sandbox.start()
    }

  const ptyId = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Create PTY session
  const ptyHandle = await sandbox.process.createPty({
    id: ptyId,
    cols,
    rows,
    onData,
  })

  try {
    await ptyHandle.waitForConnection()
  } catch (err) {
    logDaytonaError('waitForConnection', err)
    throw new Error(`[daytona:waitForConnection] ${(err as any)?.message || 'failed'}`)
  }

  data.ptyId = ptyId
  data.sandbox = sandbox
  data.ptyHandle = ptyHandle
}

const app = new Hono()

app.get('/', (c) => c.json({ status: 'ok', service: 'server', runtime: 'bun', framework: 'hono' }))
app.get('/health', (c) => c.text('ok'))

app.get(
  '/ws/pty',
  upgradeWebSocket((c) => {
    const q = c.req.query()
    const cols = Number(q.cols ?? '0') || 120
    const rows = Number(q.rows ?? '0') || 30
    const sandboxId = q.sandboxId as string | undefined
    const data: WsData = {
      ownedSandbox: false,
    }
    const decoder = new TextDecoder()

    return {
      async onOpen(_event, ws) {
        try {
          if (!sandboxId) {
            ws.send(JSON.stringify({ type: 'error', message: 'sandboxId is required' }))
            ws.close(1008, 'sandboxId required')
            return
          }
          await initPtyForConnection(data, { sandboxId, cols, rows }, (chunk: Uint8Array) => {
            try {
              const copy = new Uint8Array(chunk.byteLength)
              copy.set(chunk)
              ws.send(copy)
            } catch {}
          })
          const info = {
            type: 'info',
            sandboxId: data.sandbox!.id,
            ptyId: data.ptyId,
            cols,
            rows,
          }
          ws.send(JSON.stringify(info))

          data.ptyHandle?.wait().then((result: any) => {
            try {
              if (result?.exitCode !== 0) {
                ws.send(JSON.stringify({ type: 'exit', exitCode: result.exitCode, error: result.error }))
              }
            } catch {}
            ws.close()
          })
        } catch (err: any) {
          console.error('[ws][open] failed', err)
          ws.send(JSON.stringify({ type: 'error', message: err?.message || 'Failed to init PTY' }))
          ws.close(1011, 'PTY init failed')
        }
      },
      async onMessage(event, _ws) {
        const message = event.data
        const pty = data.ptyHandle
        const sandbox = data.sandbox
        if (!pty || !sandbox) return

        try {
          if (typeof message === 'string') {
            try {
              const m = JSON.parse(message)
              if (m && m.type === 'input' && typeof m.data === 'string') {
                await pty.sendInput(m.data)
                return
              }
              if (m && m.type === 'resize' && Number.isFinite(m.cols) && Number.isFinite(m.rows)) {
                try {
                  await sandbox.process.resizePtySession(data.ptyId!, Number(m.cols), Number(m.rows))
                } catch (err) {
                  logDaytonaError('resizePtySession', err)
                }
                return
              }
              if (m && m.type === 'kill') {
                try {
                  await pty.kill()
                } catch (err) {
                  logDaytonaError('kill', err)
                }
                return
              }
            } catch {
              await pty.sendInput(message)
            }
          } else if (message instanceof ArrayBuffer) {
            await pty.sendInput(decoder.decode(new Uint8Array(message)))
          }
        } catch {}
      },
      async onClose() {
        try {
          await data.ptyHandle?.kill()
        } catch {}
        try {
          if (data.ownedSandbox && data.sandbox) {
            await data.sandbox.stop()
          }
        } catch {}
      },
    }
  })
)

Bun.serve({
  port,
  fetch: app.fetch,
  websocket,
})

console.log(`[server] listening on http://localhost:${port}`)
