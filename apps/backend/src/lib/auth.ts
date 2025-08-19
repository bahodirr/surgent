import { betterAuth } from "better-auth";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";
import { anonymous } from "better-auth/plugins"

// Create PostgreSQL connection pool for auth
const createAuthPool = () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    connectionTimeoutMillis: 2000,
  });
};

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    process.env.CLIENT_ORIGIN || "http://localhost:3000",
    "https://yourdomain.com" // Add your production domain here
  ],
  plugins: [anonymous()],
  database: {
    dialect: new PostgresDialect({
      pool: createAuthPool(),
    }),
    type: "postgres",
  },
  
  emailAndPassword: {
    enabled: true,
    autoSignIn: true, // automatically sign in after successful registration
  },
  
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Enable ID token verification for mobile apps
      enabled: true,
      // callbackURL: "http://localhost:3000/project"   // absolute, not "/project"
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});