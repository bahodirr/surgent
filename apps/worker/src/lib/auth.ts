import { betterAuth } from "better-auth";
import { autumn } from "autumn-js/better-auth";
import { apiKey } from "better-auth/plugins";
import { dialect } from '@repo/db';

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    process.env.CLIENT_ORIGIN || "http://localhost:3000",
  ],
  plugins: [
    autumn(), // User-scoped customers by default. Configure productId in Autumn dashboard.
    apiKey({
      rateLimit: {
        enabled: false // handled by Worker DO or upstream
      }
    })
  ],
  database: {
    dialect: dialect,
    type: "postgres",
  },
  
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      enabled: true,
    },
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  
  advanced: {
    // Enable cross-subdomain cookies (e.g., *.surgent.dev)
    crossSubDomainCookies: {
      enabled: true,
    },
    // Uncomment below for cross-domain (different domains) cookies
    // defaultCookieAttributes: {
    //   sameSite: "none",
    //   secure: true,
    //   partitioned: true,
    // },
  },
});