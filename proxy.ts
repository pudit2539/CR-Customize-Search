import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, decryptSession } from "@/lib/session";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

// Optimistic, cookie-only check (no DB call) per the Next.js docs' own
// authentication guide — every mutating Route Handler re-checks the session
// itself via lib/dal.ts, so this is a fast first line of defense, not the
// only one.
function isAdminOnly(pathname: string, method: string): boolean {
  if (pathname === "/import") return true;
  if (pathname === "/settings") return true;
  if (pathname.startsWith("/api/import")) return true;
  if (pathname.startsWith("/api/export")) return true;
  if (pathname.startsWith("/api/items") && method !== "GET") return true;
  if (pathname.startsWith("/api/settings") && method !== "GET") return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const session = await decryptSession(request.cookies.get(COOKIE_NAME)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/login" && session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    if (isApi) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAdminOnly(pathname, request.method) && session.role !== "admin") {
    if (isApi) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
