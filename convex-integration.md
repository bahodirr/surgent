# Convex Integration: Exact API Flow (URLs Only)

Base hosts
- Control plane (provision host): https://api.convex.dev (replace if you run your own)
- Dashboard (end user): https://dashboard.convex.dev
- Embedded dashboard (iframe): https://dashboard-embedded.convex.dev

Auth and team selection
- List teams (for picker)
  - GET https://api.convex.dev/api/dashboard/teams
  - Headers: Authorization: Bearer {workosAccessToken}

Provision a new project and dev deployment
- Create project + dev deployment
  - POST https://api.convex.dev/api/create_project
  - Headers: Authorization: Bearer {workosAccessToken}, Content-Type: application/json
  - Body: { team: "<teamSlug>", projectName: "<name>", deploymentType: "dev" }
  - Response: { projectSlug, projectId, teamSlug, deploymentName, prodUrl, adminKey, projectsRemaining }
    - prodUrl is the dev deployment URL (your {deploymentUrl}).
- Authorize dashboard and mint project deploy key (admin token)
  - POST https://api.convex.dev/api/dashboard/authorize
  - Headers: Authorization: Bearer {workosAccessToken}, Content-Type: application/json
  - Body: { authn_token: "<workosAccessToken>", projectId: <id>, oauthApp: { clientId: "<CONVEX_OAUTH_CLIENT_ID>", clientSecret: "<CONVEX_OAUTH_CLIENT_SECRET>" } }
  - Response: { accessToken }
  - Construct project deploy key: "project:{teamSlug}:{projectSlug}|{accessToken}"

Deploy backend functions to the dev deployment
- Write admin token into runtime env: CONVEX_DEPLOY_KEY = {projectDeployKey}
- Run Convex CLI deploy:
  - npx convex dev --once
  - Or explicitly: npx convex dev --once --admin-key {projectDeployKey} --url {deploymentUrl}

Deployment environment variables (read/write)
- Auth for deployment admin APIs: Authorization: Convex {projectDeployKey}
- Read env var
  - POST {deploymentUrl}/api/query
  - Headers: Authorization: Convex {projectDeployKey}, Content-Type: application/json
  - Body: { path: "_system/cli/queryEnvironmentVariables:get", format: "convex_encoded_json", args: [{ name: "<ENV_VAR_NAME>" }] }
- Set/update env vars (one or many)
  - POST {deploymentUrl}/api/update_environment_variables
  - Headers: Authorization: Convex {projectDeployKey}, Content-Type: application/json
  - Body: { changes: [{ name: "<ENV_VAR_NAME>", value: "<VALUE>" }, ...] }

Typical variables Chef ensures
- Auth bootstrap for generated apps: JWKS, JWT_PRIVATE_KEY (generated if missing), SITE_URL (e.g., http://127.0.0.1:5173)
- OpenAI proxy (optional): CONVEX_OPENAI_API_KEY, CONVEX_OPENAI_BASE_URL = {chefSiteUrl}/openai-proxy
- Resend proxy (optional): CONVEX_RESEND_API_KEY, RESEND_BASE_URL = {chefSiteUrl}/resend-proxy

Embedded dashboard (credentials handshake)
- Iframe loads https://dashboard-embedded.convex.dev/{path}
- Iframe posts a credentials request via postMessage
- Parent responds with: { adminKey: {projectDeployKey}, deploymentUrl, deploymentName }
- Canonical dashboard URL for users: https://dashboard.convex.dev/d/{deploymentName}/{path}

Alternate OAuth connect flow (optional)
- Redirect user to authorize a project: https://dashboard.convex.dev/oauth/authorize/project?...
- Exchange code for access token
  - POST https://api.convex.dev/oauth/token (x-www-form-urlencoded)
  - Body: { grant_type: "authorization_code", code, client_id, client_secret, redirect_uri }
- Provision and authorize a dev deployment with that token
  - POST https://api.convex.dev/api/deployment/provision_and_authorize
  - Headers: Authorization: Bearer {access_token}, Content-Type: application/json
  - Body: { teamSlug: null, projectSlug: null, deploymentType: "dev" }
  - Response: { deploymentName, url, adminKey }

Cleanup (delete a project)
- List projects in a team
  - GET https://api.convex.dev/api/teams/{teamSlug}/projects
  - Headers: Authorization: Bearer {workosAccessToken}
- Delete project by id
  - POST https://api.convex.dev/api/dashboard/delete_project/{projectId}
  - Headers: Authorization: Bearer {workosAccessToken}

Headers summary
- Control plane endpoints (api.convex.dev): Authorization: Bearer {workosAccessToken} (or OAuth access token)
- Deployment admin endpoints ({deploymentUrl}): Authorization: Convex {projectDeployKey}

# Convex Integration: End‑to‑End Overview

This document explains how Chef integrates with Convex across the full lifecycle:
- authenticating a user and selecting a team
- provisioning a new Convex project and dev deployment
- surfacing deployment credentials to the UI/runtime
- deploying Convex functions from the in‑browser container
- injecting environment variables and API keys into the deployment
- embedding the Convex dashboard, and cleanup

It cites concrete code paths and endpoints so you can trace behavior precisely.

## Glossary
- Big Brain / Provision Host: Convex control plane API used by Chef to manage projects and tokens. Defaults to `https://api.convex.dev` via `BIG_BRAIN_HOST` / `PROVISION_HOST`.
- Project Deploy Key (aka admin key): Short‑lived bearer used to administer a specific Convex project/deployment, including env vars and deploy. Stored as `projectDeployKey`.
- Deployment Name: Stable identifier for a deployment, used in dashboard URLs and provisioning (e.g. `dev:abcde`).

## 1) Auth + Team Context
- Chef authenticates users via WorkOS configured for Convex’s auth service (`apiauth.convex.dev`). See `convex/auth.config.ts:1` and `app/root.tsx:142` for client config.
- The UI fetches the user’s teams from the control plane to drive selection UIs.
  - Server: `convex/admin.ts:77` calls `GET {PROVISION_HOST}/api/dashboard/teams` to check admin status and list teams.
  - Client: `app/lib/stores/startup/useTeamsInitializer.ts:25` also calls the same endpoint to populate the team selector.

Env required by Chef to talk to the control plane:
- `BIG_BRAIN_HOST` or `VITE_PROVISION_HOST` / `PROVISION_HOST` (defaults to `https://api.convex.dev`).
- `WORKOS_CLIENT_ID` for login + dashboard embed.
- OAuth client for dashboard authorization: `CONVEX_OAUTH_CLIENT_ID`, `CONVEX_OAUTH_CLIENT_SECRET`.
  - README has a quickstart: `README.md:65` and env list `README.md:70`.

## 2) Provision a New Convex Project + Dev Deployment
When the user clicks “Connect” after picking a team, the client calls a Convex mutation which kicks off provisioning:
- Client entrypoint: `app/components/convex/ConvexConnectButton.tsx:28` → mutation `api.convexProjects.startProvisionConvexProject` with `{ teamSlug, workosAccessToken }`.
- Server mutation: `convex/convexProjects.ts:86` → `startProvisionConvexProjectHelper`.
- Schedules an internal action `connectConvexProjectForOauth` and a timeout check:
  - `convex/convexProjects.ts:131` and `:137`.

The internal action provisions via the control plane and authorizes dashboard access:
- Control plane host lookup: `convex/convexProjects.ts:244` `ensureEnvVar("BIG_BRAIN_HOST")`.
- Project name (best‑effort) is derived from the chat title; default “My Project (Chef)”. See `:249` and `:260`.
- Create project + dev deployment:
  - `POST {BIG_BRAIN_HOST}/api/create_project` with body `{ team, projectName, deploymentType: "dev" }` and `Authorization: Bearer {workosAccessToken}` (`convex/convexProjects.ts:261`).
  - Returns `{ projectSlug, projectId, deploymentName, prodUrl, adminKey, projectsRemaining }` (`:300`).
- Authorize dashboard and mint Project Deploy Key:
  - `POST {BIG_BRAIN_HOST}/api/dashboard/authorize` with `{ authn_token, projectId, oauthApp: { clientId, clientSecret } }` (`:311`).
  - Response `{ accessToken }` → stored as `projectDeployKey` (string form: `project:{teamSlug}:{projectSlug}|{accessToken}`) (`:334`–`:336`).
- Persist credentials and mark chat connected:
  - Writes `convexProjectCredentials` row with `projectDeployKey` (`:158`) and patches the chat with `{ deploymentUrl, deploymentName, teamSlug, projectSlug }` (`:174`–`:183`).

The UI then loads the connected credentials for this chat:
- Query: `convex/convexProjects.ts:26` returns `{ projectSlug, teamSlug, deploymentUrl, deploymentName, adminKey }` from DB.
- Client stores it: `app/lib/stores/startup/useProjectInitializer.ts:10` → `convexProjectStore.set({ token: adminKey, ... })`.

Result: the browser now holds (via state) the project’s admin token (`token`), `deploymentUrl`, `deploymentName`, and slugs to drive subsequent steps.

## 3) Deploying Convex Functions from the Browser
Chef runs deploys entirely in the in‑browser Node env (WebContainer) and targets the connected deployment using the Project Deploy Key.

- On first container boot, Chef writes the token to `.env.local` inside the WebContainer as `CONVEX_DEPLOY_KEY` (`app/lib/stores/startup/useContainerSetup.ts:139`–`:147`).
- The “deploy” tool call executes:
  - `convex codegen` → Convex dir typecheck
  - `tsc --noEmit -p tsconfig.app.json` → app typecheck
  - `convex dev --once --typecheck=disable` → push functions to the connected dev deployment
  - Implementation: `app/lib/runtime/action-runner.ts:482`–`:499`.
- The same pattern is used in tests with explicit args: `test-kitchen/convexBackend.ts:86` runs `convex dev --once --admin-key {admin_key} --url {deploymentUrl}`.

Notes:
- Locally during repo setup, you may see `VITE_CONVEX_URL=placeholder` to avoid the CLI guessing an incorrect client env var (README/DEVELOPMENT notes).

## 4) Injecting Env Vars and API Keys into the Deployment
Chef can programmatically read and write deployment env vars using the admin token plus two Convex admin endpoints exposed by the deployment itself:
- Query: `POST {deploymentUrl}/api/query` with body `{ path: "_system/cli/queryEnvironmentVariables:get", format: "convex_encoded_json", args: [{ name }] }` and header `Authorization: Convex {token}` (`chef-agent/convexEnvVariables.ts:20`–`:31`).
- Update: `POST {deploymentUrl}/api/update_environment_variables` with body `{ changes: [{ name, value }, ...] }` and same `Authorization` (`chef-agent/convexEnvVariables.ts:48`–`:61`).

Chef calls these to ensure required config exists:
- OpenAI proxy (if enabled): sets `CONVEX_OPENAI_API_KEY` and `CONVEX_OPENAI_BASE_URL` pointing back to Chef’s proxy (`useContainerSetup.ts:150`–`:161`).
- Resend proxy token (email): sets `CONVEX_RESEND_API_KEY` and `RESEND_BASE_URL` (`useContainerSetup.ts:164`–`:175`).
- Convex Auth bootstrap for the generated app: if missing, generates keys and sets `JWKS`, `JWT_PRIVATE_KEY`, and ensures `SITE_URL` to `http://127.0.0.1:5173` (`chef-agent/convexAuth.ts:7`–`:26`).

For other provider secrets, the agent can open the dashboard to the env vars UI and instruct the user to paste values:
- Tool: `addEnvironmentVariables` computes a deep link like `settings/environment-variables?var=NAME` and opens the embedded dashboard (`app/lib/runtime/action-runner.ts:509`–`:521`).

## 5) Embedded Dashboard + Credentials Handshake
Chef embeds the Convex dashboard to let users view and manage their project without leaving the app:
- UI component: `app/components/workbench/Dashboard.tsx`.
- The iframe loads `https://dashboard-embedded.convex.dev/{path}` and, upon `dashboard-credentials-request`, the parent replies via `postMessage` with `{ adminKey, deploymentUrl, deploymentName }` sourced from `convexProjectStore` (`Dashboard.tsx:17`–`:45`).
- A visible address bar points to the canonical dashboard URL `https://dashboard.convex.dev/d/{deploymentName}/{path}` for opening in a new tab.

## 6) Optional OAuth Connect Flow (legacy/alternate)
There’s an alternate route that redirects the browser to authorize a project with the dashboard and then exchanges the code for a token via Chef:
- Redirect: `app/routes/convex.connect.tsx:17` builds `https://dashboard.convex.dev/oauth/authorize/project?...`.
- Callback server: `app/routes/api.convex.callback.ts` exchanges `code` for an access token via `{PROVISION_HOST}/oauth/token` and then calls `{PROVISION_HOST}/api/deployment/provision_and_authorize` to get `{ deploymentName, url }`.
- Callback client: `app/routes/convex.callback.tsx` stores these in `localStorage`.
Today, the primary flow uses the Convex mutation + control plane calls in `convex/convexProjects.ts` which persists credentials in Convex tables; the OAuth page remains as a compatibility path.

## 7) Cleanup and Deletion
When the chat is deleted, Chef can optionally delete the Convex project:
- Action param `shouldDeleteConvexProject` triggers `tryDeleteProject` which finds the project id and posts `POST {BIG_BRAIN_HOST}/api/dashboard/delete_project/{projectId}` (`convex/messages.ts:634` and `:688`).
- Stored `convexProjectCredentials` are deleted from Chef’s DB (`convex/messages.ts:688`–`:700`).

## 8) Required Env Vars (Chef app)
- Control plane: `BIG_BRAIN_HOST` or `PROVISION_HOST`/`VITE_PROVISION_HOST` (default `https://api.convex.dev`).
- Dashboard OAuth app: `CONVEX_OAUTH_CLIENT_ID`, `CONVEX_OAUTH_CLIENT_SECRET`.
- WorkOS client id: `WORKOS_CLIENT_ID`.
- Local dev hints: `VITE_CONVEX_URL=placeholder` (see `DEVELOPMENT.md:22` and `:31`).
- Optional: `OPENAI_PROXY_ENABLED` and related env to enable Chef’s OpenAI proxy (`convex/openaiProxy.ts`).

## 9) Commands & Tooling Summary
- Deploy (from WebContainer):
  - `convex codegen` → typecheck Convex dir
  - `tsc --noEmit -p tsconfig.app.json` → full app typecheck
  - `convex dev --once --typecheck=disable` → deploy (`app/lib/runtime/action-runner.ts:482`–`:499`).
- CLI auth token for deploy: `.env.local` `CONVEX_DEPLOY_KEY` (`useContainerSetup.ts:139`–`:147`).

## 10) Security Considerations
- Project deploy key scope is limited to the specific project; stored server‑side in `convexProjectCredentials` and surfaced to the client runtime only for the active chat.
- The embedded dashboard requests credentials via `postMessage` only when loaded; the parent sends just `{ adminKey, deploymentUrl, deploymentName }`.
- Env var writes are done via HTTPS to the deployment; failures are retried a few times (`chef-agent/convexEnvVariables.ts:3`–`:14`).

## 11) Data Flow (text)
- User logs in (WorkOS) → selects team.
- Client calls Convex mutation → server contacts control plane to `create_project` → gets `deploymentName`, `prodUrl`, and mints `projectDeployKey` via `dashboard/authorize`.
- Server stores credentials → client queries and stores `{ token, deploymentUrl, deploymentName }`.
- Container writes `CONVEX_DEPLOY_KEY` → deploy tool runs `convex dev --once`.
- Runtime ensures required env (`JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL`, proxy keys) via deployment admin endpoints.
- Optional manual secret entry via dashboard env vars page.

## 12) Quick Pointers
- Provision & credentials persistence: `convex/convexProjects.ts:244`, `:261`, `:311`, `:334`, `:145`.
- Client pickup: `app/lib/stores/startup/useProjectInitializer.ts:10`.
- Deploy execution: `app/lib/runtime/action-runner.ts:482`–`:499`.
- Env var API usage: `chef-agent/convexEnvVariables.ts:20`, `:48`.
- Auth bootstrap env: `chef-agent/convexAuth.ts:7`–`:26`.
- Dashboard embed creds handshake: `app/components/workbench/Dashboard.tsx:17`–`:45`.

---

If you want me to add an architecture diagram or sequence chart into this doc, say the word and I’ll include one.
