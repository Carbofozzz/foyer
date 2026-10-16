import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { isLocale, negotiateLocale } from "@/lib/i18n/config";

/** Personal cabinet needs a session. `/cabinet/demo`, `/cabinet/admin`, and `cab_` links decide for themselves. */
const CABINET_HOME = /^\/[a-z]{2}\/cabinet\/?$/;

function routeLocale(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const first = pathname.split("/")[1];
  if (isLocale(first)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-foyer-locale", first);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const cookie = request.cookies.get("foyer_locale")?.value;
  const locale = isLocale(cookie) ? cookie : negotiateLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

const withClerk = clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (CABINET_HOME.test(pathname)) {
    const { userId } = await auth();
    if (!userId) {
      const url = request.nextUrl.clone();
      url.pathname = `/${pathname.split("/")[1]}`;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  return routeLocale(request);
});

function clerkReady(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  // Agent keys never carry a Clerk session; a non-JWT bearer would only confuse Clerk.
  const bearer = request.headers.get("authorization") ?? "";
  if (!clerkReady() || /^Bearer\s+agk_/i.test(bearer)) return routeLocale(request);
  return withClerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
