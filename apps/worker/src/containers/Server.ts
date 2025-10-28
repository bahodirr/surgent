import { Container } from '@cloudflare/containers'
import { env } from "cloudflare:workers";

export class Server extends Container {
  defaultPort = 5050
  sleepAfter = '15m'
  enableInternet = true
  
  envVars = {
    DAYTONA_API_URL: env.DAYTONA_API_URL as string,
    DAYTONA_API_KEY: env.DAYTONA_API_KEY as string,
    DAYTONA_ORG_ID: env.DAYTONA_ORG_ID as string,
  };
}


