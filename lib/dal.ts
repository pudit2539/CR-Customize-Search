import "server-only";
import { cache } from "react";
import { getSessionFromCookies, type SessionPayload } from "./session";

// Cached per-request so multiple checks in the same render/route don't each
// pay the cookie-decrypt cost.
export const verifySession = cache(async (): Promise<SessionPayload | null> => {
  return getSessionFromCookies();
});

type AuthResult = { session: SessionPayload; response?: undefined } | { session?: undefined; response: Response };

// Route Handlers call this even though `proxy.ts` already redirected
// unauthenticated page requests — proxy is an optimistic check only, per the
// Next.js docs, and shouldn't be the sole line of defense for mutations.
export async function requireAuth(): Promise<AuthResult> {
  const session = await verifySession();
  if (!session) {
    return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export async function requireAdmin(): Promise<AuthResult> {
  const result = await requireAuth();
  if (result.response) return result;
  if (result.session.role !== "admin") {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return result;
}
