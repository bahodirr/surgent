# apps/worker

Utilities for the Cloudflare Worker that handles dispatch deployments.

## Packaging a deploy payload

After building a project (for example `cloudflare-vite-react-template`) the helper `tools/createDeployPayload.ts` can assemble the JSON payload required by `POST /deploy`:

```bash
# from the project root that contains dist/index.js and wrangler.jsonc
bunx tsx ../../apps/worker/tools/createDeployPayload.ts .

# optionally pick a destination
bunx tsx ../../apps/worker/tools/createDeployPayload.ts . /tmp/deploy-payload.json
```

The script reads `wrangler.jsonc`, the worker bundle at `dist/index.js`, and any assets under `dist/client/**`, producing `deploy-payload.json`. Deploy by posting that file to the worker:

```bash
curl -X POST "https://<your-worker-domain>/deploy" \
  -H 'content-type: application/json' \
  --data-binary @deploy-payload.json
```

The worker uses the credentials provided via Wrangler (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `DISPATCH_NAMESPACE_NAME`) to push into the dispatch namespace.

## Dispatch namespace notes

```
npx wrangler dispatch-namespace create prod
npx wrangler dispatch-namespace create default-surgent-namespace
```

(Example output)

```
Created dispatch namespace "default-surgent-namespace" with ID "6bd38a90-3c54-48c8-9dd2-2586eaf6e2fa"
```
