import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const useDemo =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || process.env.DEMO_MODE === "true";

function demoMiddleware(_req: NextRequest) {
  return NextResponse.next();
}

function createClerkMiddleware() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { clerkMiddleware, createRouteMatcher } = require("@clerk/nextjs/server") as typeof import("@clerk/nextjs/server");

  const isPublicRoute = createRouteMatcher([
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/webhooks(.*)",
    "/api/demo(.*)",
  ]);
  const isCrmRoute = createRouteMatcher(["/crm(.*)"]);
  const isPortalRoute = createRouteMatcher(["/portal(.*)"]);

  return clerkMiddleware(async (auth, req) => {
    if (isPublicRoute(req)) return;
    const session = await auth();
    if (!session.userId) {
      return session.redirectToSignIn({ returnBackUrl: req.url });
    }
    const role =
      (session.sessionClaims?.metadata as { role?: string } | undefined)?.role ??
      (session.sessionClaims as { publicMetadata?: { role?: string } } | undefined)
        ?.publicMetadata?.role;

    // Staff portal redirect only when the session explicitly carries a staff role.
    // CRM access is enforced server-side from the database role so invited users
    // aren't blocked when Clerk session claims haven't synced yet.
    if (isPortalRoute(req) && (role === "owner" || role === "sales")) {
      return NextResponse.redirect(new URL("/crm/dashboard", req.url));
    }
  });
}

export default useDemo ? demoMiddleware : createClerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
