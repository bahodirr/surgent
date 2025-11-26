# Surgent Cloudflare Worker

The `apps/worker` workspace defines the Cloudflare Worker that fronts Daytona sandboxes during development, proxies dispatch workers in production, and accepts deployment payloads from the Convex backend.

## Responsibilities
- `POST /deploy` – receives the bundle produced by `packages/backend/convex/agent.ts`, uploads assets to Cloudflare Dispatch, and publishes the worker (see `services/deployer`).
- Preview proxy – requests to `https://<port>-<sandboxId>.<worker-domain>` are warmed up against Daytona via `SandboxApi` and forwarded with the correct preview token.
- AI Proxy – `POST /api/proxy/:provider/*` (e.g. `openai`, `anthropic`) forwards requests to upstream LLM providers, injecting secrets server-side. Authenticated via session cookie or `Authorization: Bearer <api-key>`.
- Dispatch routing – other hostnames are resolved through the bound `dispatcher` namespace so you can serve previously deployed workers from the same entrypoint.
- Health check – `GET /health` responds with `ok` for uptime probes.

## Environment
Configure vars either in `wrangler.jsonc`, `.dev.vars`, or via `wrangler secret put`:

```dotenv
DISPATCH_NAMESPACE_NAME=default-surgent-namespace
CLOUDFLARE_ACCOUNT_ID=<your-cloudflare-account-id>
CLOUDFLARE_API_TOKEN=<your-cloudflare-api-token>
DAYTONA_API_URL=https://app.daytona.io/api
DAYTONA_API_KEY=<your-daytona-api-key>
DEFAULT_SANDBOX_PORT=3000
```

Secrets (`DAYTONA_API_KEY`, `CLOUDFLARE_API_TOKEN`) should be set with `wrangler secret put ...` in production. The account ID and namespace values can live in `wrangler.jsonc` if you are comfortable checking them in.

## Local Development
- `bun run dev` (from the repo root) runs `wrangler dev` alongside the other workspaces.
- `bun run --filter worker dev` runs just the Worker.

By default Wrangler serves on `https://localhost:8787`. The web app expects previews at `https://3000-<sandboxId>.localhost:8787`, so update `NEXT_PUBLIC_PROXY_URL` accordingly when testing locally.

## Deployment
Deploy the Worker once your Daytona and Cloudflare accounts are configured:

```bash
bun run --filter worker deploy
```

The Convex backend will call `POST /deploy` with a payload containing `wranglerConfig`, the built worker script, optional asset manifests, and extra modules. See `services/deployer` for the upload steps and the Cloudflare API calls involved.

## Code Layout
- `src/index.ts` – request router, deploy handler, preview proxy, and dispatch pass-through.
- `services/deployer` – wraps the Cloudflare REST APIs for assets, uploads, and worker publication.
- `wrangler.jsonc` – worker metadata, dispatch namespace bindings, and default variables.
