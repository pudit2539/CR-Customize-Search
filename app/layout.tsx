import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import { getSessionFromCookies } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CR/Customize Search",
  description: "ค้นหา CR/Customize เก่าที่ใกล้เคียงกับ requirement ใหม่",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSessionFromCookies();

  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-zinc-900">
        {session ? (
          <div className="flex h-screen gap-4 p-4">
            <Sidebar session={session} />
            <main className="min-w-0 flex-1 overflow-y-auto rounded-2xl border border-zinc-100 bg-white shadow-sm shadow-zinc-200/70">
              {children}
            </main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
