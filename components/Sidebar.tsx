"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Autocomplete from "./Autocomplete";
import {
  Search,
  Calculator,
  LayoutDashboard,
  Lightbulb,
  List,
  Star,
  Upload,
  History,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
} from "lucide-react";

interface MenuItem {
  href: string;
  label: string;
  icon: typeof Search;
  adminOnly?: boolean;
}

const MENU: MenuItem[] = [
  { href: "/", label: "Search", icon: Search },
  { href: "/estimate", label: "Create Quotation", icon: Calculator },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/items", label: "Items", icon: List },
  { href: "/std-candidates", label: "STD Candidates", icon: Star },
  { href: "/import", label: "Import", icon: Upload, adminOnly: true },
  { href: "/history", label: "History", icon: History },
];

const SYSTEM_MENU: MenuItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

interface Session {
  username: string;
  role: string;
}

export default function Sidebar({ session }: { session: Session | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const isAdmin = session?.role === "admin";

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function handleQuickSearch(q: string) {
    if (!q.trim()) return;
    router.push(`/?q=${encodeURIComponent(q.trim())}`);
    setQuickQuery("");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function renderItem(item: MenuItem) {
    if (item.adminOnly && !isAdmin) return null;
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
          active
            ? "bg-indigo-50 font-semibold text-indigo-700 shadow-sm shadow-indigo-100"
            : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
        } ${collapsed ? "justify-center" : ""}`}
      >
        <Icon size={18} strokeWidth={2} className="shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  }

  return (
    <aside
      className={`flex h-full flex-col rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm shadow-zinc-200/70 transition-all ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <div className={collapsed ? "flex flex-col items-center gap-2" : "flex items-center justify-between gap-2"}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-200">
          <Sparkles size={17} />
        </span>
        {!collapsed && <span className="flex-1 text-base font-semibold whitespace-nowrap">CR Search</span>}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
          title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {!collapsed && (
        <>
          <p className="mt-6 px-1 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
            Quick Actions
          </p>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
            <Search size={15} className="shrink-0 text-zinc-400" />
            <Autocomplete
              value={quickQuery}
              onChange={setQuickQuery}
              onSubmit={handleQuickSearch}
              suggestionType="query"
              placeholder="Search"
              className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
            />
          </div>
        </>
      )}

      {collapsed ? (
        <div className="mt-6 border-t border-zinc-100" />
      ) : (
        <p className="mt-6 px-1 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Menu</p>
      )}
      <nav className="mt-2 flex flex-col gap-0.5">{MENU.map(renderItem)}</nav>

      {(isAdmin || !collapsed) && SYSTEM_MENU.some((i) => !i.adminOnly || isAdmin) && (
        <>
          {collapsed ? (
            <div className="mt-6 border-t border-zinc-100" />
          ) : (
            <p className="mt-6 px-1 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">System</p>
          )}
          <nav className="mt-2 flex flex-col gap-0.5">{SYSTEM_MENU.map(renderItem)}</nav>
        </>
      )}

      <div className="flex-1" />

      {session && (
        <div
          className={`mt-6 rounded-lg border border-zinc-200 ${
            collapsed ? "flex flex-col items-center gap-2 p-2" : "flex items-center gap-2.5 p-2.5"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white shadow-sm shadow-indigo-200">
            {session.username.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900">{session.username}</p>
              <p className="truncate text-xs text-zinc-400">
                {session.role === "admin" ? "admin" : "user"}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            title="ออกจากระบบ"
            className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-red-600"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}
