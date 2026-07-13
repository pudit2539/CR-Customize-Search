import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createSession, type Role } from "@/lib/session";

interface Account {
  username: string;
  password: string;
  role: Role;
}

function accounts(): Account[] {
  return [
    { username: process.env.AUTH_ADMIN_USER ?? "", password: process.env.AUTH_ADMIN_PASS ?? "", role: "admin" },
    { username: process.env.AUTH_DEMO_USER ?? "", password: process.env.AUTH_DEMO_PASS ?? "", role: "user" },
  ];
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Different lengths would throw in timingSafeEqual — pad so length alone
  // isn't a cheap early-exit signal, then compare in constant time.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const { username, password } = (await request.json()) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const match = accounts().find(
    (a) => a.username && safeEqual(a.username, username) && safeEqual(a.password, password)
  );
  if (!match) {
    return NextResponse.json({ error: "invalid username or password" }, { status: 401 });
  }

  await createSession({ username: match.username, role: match.role });
  return NextResponse.json({ username: match.username, role: match.role });
}
