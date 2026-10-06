"use client";

import { useEffect, useState } from "react";
import { Menu, Sparkles } from "lucide-react";
import Sidebar from "./Sidebar";
import { warmAllPages } from "@/lib/dataCache";

interface Session {
  username: string;
  role: string;
}

export default function AppShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Preload the main pages' data once the shell is up (idle, so it doesn't
  // compete with the current page's own requests) — the first click on
  // Dashboard/Items/Insights then finds the data already cached.
  useEffect(() => {
    const t = setTimeout(warmAllPages, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex h-screen flex-col md:flex-row md:gap-4 md:p-4">
      {/* Mobile top bar — only visible below md, hosts the hamburger that
          opens the sidebar as an overlay drawer. */}
      <header className="flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-50"
          aria-label="เปิดเมนู"
        >
          <Menu size={20} />
        </button>
        <span className="icon-badge h-7 w-7 shrink-0 rounded-lg">
          <Sparkles size={14} />
        </span>
        <span className="text-sm font-semibold">CR Search</span>
      </header>

      <Sidebar
        session={session}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--canvas)] md:rounded-2xl md:border md:border-slate-200/70 md:shadow-[0_1px_3px_rgb(15_23_42/0.06)]">
        {children}
      </main>
    </div>
  );
}
