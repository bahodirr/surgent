# Surgent Convex Backend

This directory contains the Convex functions that back the Surgent workspace. It wires up auth, project provisioning, Daytona sandbox orchestration, the Claude/AI agent pipeline, and deployment flows that push Cloudflare Workers.

## Structure
- `agent.ts` – internal actions that initialize/resume Daytona sandboxes, stream agent output, persist checkpoints, and trigger Cloudflare deployments via the Worker `/deploy` endpoint.
- `agentic/` – lower-level helpers that wrap `@ai-sdk/*` providers, manage local checkpoints, and adapt the Daytona SDK for sandbox file/command access.
- `projects.ts` – authenticated queries/mutations for projects, templates, quota checks, and sandbox state persistence.
- `sessions.ts` & `commits.ts` – timeline storage for agent messages, todos, and git-style checkpoints stored in Convex tables.
- `auth.ts` / `auth.config.ts` – configuration for `@convex-dev/auth` including Google OAuth handling.
- `schema.ts` – Convex table definitions, composed with the auth tables.
- `sandbox.ts` & `config.ts` – Daytona client helpers plus environment lookups for Daytone, model providers, and Cloudflare deploy URLs.

## Environment
`packages/backend/.env.local` must define:

```dotenv
DAYTONA_API_KEY=your-daytona-key
DAYTONA_SERVER_URL=https://app.daytona.io/api
ANTHROPIC_API_KEY=your-anthropic-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
OPENAI_API_KEY=your-openai-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
CONVEX_SITE_URL=https://<your-convex-deployment>.convex.site
CLOUDFLARE_DEPLOY_URL=https://<your-worker-domain>/deploy
```

Model provider variables are optional unless you plan to call that provider. `CLOUDFLARE_DEPLOY_URL` should point at the Cloudflare Worker that receives the deployment payload generated in `agent.ts`.

## Development Workflow
- `bun run --filter @repo/backend dev` launches `convex dev` with hot reload.
- `bun run --filter @repo/backend setup` blocks until the Convex deployment is reachable (useful on first run).
- `bun run --filter @repo/backend deploy` pushes all Convex functions to production.

## Daytona Snapshot Utility
The script at `scripts/create-snapshot.ts` can build the `default-env:1.0.0` Daytona snapshot used for new sandboxes. It expects `DAYTONA_API_KEY` in the same `.env.local` file:

```bash
bun run --filter @repo/backend create-snapshot
```

## Testing & Linting
Convex functions participate in the shared repo lint/type-check commands:

```bash
bun run --filter @repo/backend lint
bun run --filter @repo/backend check-types
```

Refer to the root `README.md` for additional setup notes and the end-to-end development loop.
