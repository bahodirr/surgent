# Surgent

Surgent is an agentic development workspace that pairs Claude Code with Daytona sandboxes. This monorepo contains everything needed to run the UI, Convex backend, and preview proxy locally or in production.

## Tech Stack
- Next.js 15, React 19, Tailwind CSS 4 for the front-end (`apps/web`).
- Convex 1.x with `@convex-dev/auth` for data, auth, and scheduled actions (`packages/backend`).
- Daytona API (`@daytonaio/sdk`) plus a Bun + Hono + `http-proxy` preview gateway (`apps/proxy`).
- Turborepo 2.5 orchestrating builds; Bun 1.2.20 as the package manager/runtime.
- TypeScript 5.9 everywhere with ESLint 9 and Prettier 3 for linting and formatting.

## Features
- Chat-first project view that logs timeline updates, todos, and session output in real time.
- Daytona-backed sandbox control: create, resume, or deploy environments with a single mutation.
- Live browser preview piped through the Bun/Hono proxy; preview tokens and warm-up are handled for you.
- Drop in credentials for Anthropic Claude, OpenAI, and Google OAuth to enable providers instantly.

## Monorepo Layout
| Path | Description |
| --- | --- |
| `apps/web` | Next.js dashboard, chat surface, and preview UI. |
| `apps/proxy` | Bun + Hono service that forwards sandbox previews and websockets. |
| `packages/backend` | Convex functions, auth config, and agent orchestration helpers. |
| `packages/typescript-config` | Shared TypeScript presets consumed by all workspaces. |

## Setup
### Requirements
- Node.js 18+
- Bun 1.2.20 (`packageManager` pin)
- Convex CLI (`npm i -g convex`) and a Convex project/URL
- Daytona API credentials with access to the `default-web-env:1.0.0` snapshot
- API keys for Anthropic and/or OpenAI, plus Google OAuth client credentials

### Install
```bash
git clone https://github.com/<your-org>/surgent.git
cd surgent
bun install
```

### Environment Variables
Create these files (or export the same variables in your shell) before running anything:

`./.env`
```dotenv
DAYTONA_API_KEY=your-daytona-key
DAYTONA_API_URL=https://app.daytona.io/api
PORT=1234
DEFAULT_SANDBOX_PORT=3000
DEBUG_PROXY=0
```

`packages/backend/.env.local`
```dotenv
DAYTONA_API_KEY=your-daytona-key
DAYTONA_SERVER_URL=https://app.daytona.io/api
ANTHROPIC_API_KEY=your-anthropic-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
OPENAI_API_KEY=your-openai-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
CONVEX_SITE_URL=https://<your-convex-deployment>.convex.site
```

`apps/web/.env.local`
```dotenv
NEXT_PUBLIC_CONVEX_URL=https://<your-convex-deployment>.convex.site
NEXT_PUBLIC_PROXY_URL=localhost:1234
```
Run `bun run --filter @repo/backend setup` once to ensure `convex dev` can reach your Convex deployment and to confirm the site URL.

### Model Providers
- **Claude Code (Anthropic)** — Set `ANTHROPIC_BASE_URL=https://api.anthropic.com` and provide an `ANTHROPIC_API_KEY` created from the Anthropic console. Pass `model: "claude-3.5-sonnet"` (or any Claude Code variant) when triggering the agent if you want to override the default.
- **GLM-4.5** — The backend defaults to `glm-4.5` when an Anthropic-compatible endpoint is supplied. Use `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic` and copy the API token from your https://docs.z.ai/scenario-example/develop-tools/claude. Store that value in `ANTHROPIC_API_KEY`.

## Development
```bash
bun run dev
```
This starts `convex dev`, `next dev --port 3000`, and the Bun proxy on port 1234. Visit http://localhost:3000 to sign in, create a project, and view the live preview served from `https://<sandbox-id>.localhost:1234`.

Individual dev servers:
```bash
bun run --filter @repo/backend dev   # Convex backend
bun run --filter web dev             # Next.js app
bun run --filter proxy dev           # Preview proxy
```

## Production
```bash
bun run lint
bun run check-types
bun run build
```
- Deploy Convex with `bun run --filter @repo/backend deploy`.
- Build the proxy via `bun run --filter proxy build` and start with `bun run --filter proxy start`.
- Run `next build` output (`apps/web/.next`) behind your hosting provider of choice.

## Scripts
| Command | Description |
| --- | --- |
| `bun run dev` | Run all dev tasks through Turborepo. |
| `bun run lint` | Lint the repo with ESLint. |
| `bun run check-types` | Project-wide type checking. |
| `bun run build` | Build all workspaces for production. |
| `bun run format` | Format `.ts`, `.tsx`, and `.md` files with Prettier. |
| `bun run --filter @repo/backend setup` | Block until `convex dev` can reach the deployment. |
| `bun run --filter @repo/backend create-snapshot` | Create a Daytona snapshot (requires credentials). |

## Contributing
Open an issue or pull request with your proposed change. Please run `bun run lint` and `bun run check-types` before submitting.
