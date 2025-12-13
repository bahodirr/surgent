// Centralized environment variables as a single config object
export const config = {
  daytona: {
    apiKey: process.env.DAYTONA_API_KEY,
    serverUrl: process.env.DAYTONA_SERVER_URL,
    snapshot: process.env.DAYTONA_SNAPSHOT || "default-env:1.0.0",
  },
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    dispatchNamespace: process.env.DISPATCH_NAMESPACE_NAME,
    deployUrl: process.env.CLOUDFLARE_DEPLOY_URL,
  },
  convex: {
    host: process.env.CONVEX_HOST || 'https://api.convex.dev',
    teamId: process.env.CONVEX_TEAM_ID,
    teamToken: process.env.CONVEX_TEAM_TOKEN,
  },
  helicone: {
    apiKey: process.env.HELICONE_API_KEY!,
  },
  vercel: {
    apiKey: process.env.VERCEL_API_KEY!,
  },
} as const;
