import { createAuthClient } from "better-auth/react";
import { nextCookies } from "better-auth/next-js";

// Create the auth client - explicit type to satisfy TypeScript
const authClient: ReturnType<typeof createAuthClient> = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
  plugins: [nextCookies()] // make sure this is the last plugin in the array
});

// Export the client
export { authClient }; 