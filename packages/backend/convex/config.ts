// Centralized environment variables as a single config object
export const config = {
  daytona: {
    apiKey: process.env.DAYTONA_API_KEY,
    serverUrl: process.env.DAYTONA_SERVER_URL,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  cloudflare: {
    deployUrl: process.env.CLOUDFLARE_DEPLOY_URL,
  },
} as const;

