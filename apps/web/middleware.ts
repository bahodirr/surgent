import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { authClient } from "@/lib/auth-client";

export async function middleware(request: NextRequest) {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
    },
  });

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/dashboard"], // Apply middleware to specific routes
};
