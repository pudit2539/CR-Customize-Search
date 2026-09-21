"use client";

import { useState } from "react";
import { Menu, Sparkles } from "lucide-react";
import Sidebar from "./Sidebar";

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
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
          <Sparkles size={14} />
        </span>
        <span className="text-sm font-semibold">CR Search</span>
      </header>

      <Sidebar
        session={session}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="min-w-0 flex-1 overflow-y-auto md:rounded-2xl md:border md:border-zinc-100 md:bg-white md:shadow-sm md:shadow-zinc-200/70">
        {children}
      </main>
    </div>
  );
}
