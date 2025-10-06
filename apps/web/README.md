# Surgent Web App

The `apps/web` workspace hosts the Surgent dashboard built with Next.js 15 (App Router), React 19, Tailwind CSS 4, and the shared UI system in `@/components`. It talks directly to the Convex backend for data and agent actions and renders live Daytona previews supplied by the Cloudflare Worker.

## Environment
Configure `apps/web/.env.local` before running the app:

```dotenv
NEXT_PUBLIC_CONVEX_URL=https://<your-convex-deployment>.convex.site
NEXT_PUBLIC_PROXY_URL=<worker-domain>
```

For local development the worker runs through `wrangler dev`, so `NEXT_PUBLIC_PROXY_URL=localhost:8787` is typically enough. In production point it at the deployed Worker domain (for example `preview.surgent.dev`).

## Local Development
- `bun run dev` from the repo root starts the web app alongside the Convex backend and Cloudflare Worker.
- `bun run --filter web dev` runs `next dev --turbopack` just for this workspace.

The dashboard expects the Convex dev server to be reachable and the Worker to provide preview hosts at `https://3000-<sandboxId>.<worker-domain>`.

## Scripts
- `bun run --filter web build` – generate the production bundle (`next build`).
- `bun run --filter web lint` – lint with ESLint 9.
- `bun run --filter web check-types` – type-check with `tsc --noEmit`.

## Key Integrations
- Auth and session state come from `@convex-dev/auth`.
- Project data, agent runs, and deployments call Convex mutations/queries exposed from `@repo/backend`.
- Preview panes embed the Worker-backed sandbox URLs via the `preview-panel` and `split-view` components.
