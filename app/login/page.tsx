"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LogIn, Sparkles, User } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-100 via-zinc-100 to-zinc-200 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-200/60">
        <div className="flex flex-col items-center text-center">
          <span className="icon-badge h-12 w-12 rounded-2xl">
            <Sparkles size={22} />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-zinc-900">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-zinc-500">CR/Customize Search</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3">
          <div className="relative">
            <User size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              className="control w-full py-2.5 pl-9"
            />
          </div>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              className="control w-full py-2.5 pl-9"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="btn btn-primary mt-1 py-2.5"
          >
            {loading ? (
              "กำลังเข้าสู่ระบบ..."
            ) : (
              <>
                <LogIn size={15} />
                เข้าสู่ระบบ
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
