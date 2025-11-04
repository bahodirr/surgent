import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Lightweight middleware that checks only for the presence of a Better Auth
// session cookie and redirects unauthenticated users to /login. This is NOT a
// security guarantee—always validate the session from the server side on
// critical pages or actions.
export async function middleware(request: NextRequest) {
  // Skip auth check for public routes
  if (request.nextUrl.pathname === "/" || request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup") {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    // Optimistic redirect to login when no cookie is present
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Apply middleware to all routes except static files and API routes
  matcher: ["/((?!share|api|_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$).*)"],
};