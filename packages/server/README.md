# backend (Hono + Bun)

Hono server running on Bun.

## Install

```bash
bun install
```

## Develop

```bash
# hot-reload
bun run dev
```

## Build & Start

```bash
bun run build
bun run start
```

## Endpoints

- `GET /` → JSON service status
- `GET /health` → "ok"

`PORT` defaults to `3000`.
