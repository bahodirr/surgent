import { createAuthClient } from "better-auth/react";

// Create the auth client - explicit type to satisfy TypeScript
const authClient: ReturnType<typeof createAuthClient> = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000",
});

// Export the client
export { authClient }; 