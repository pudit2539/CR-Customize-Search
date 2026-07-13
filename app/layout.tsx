import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import LogoutButton from "@/components/LogoutButton";
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
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4 text-sm font-medium">
            <span className="text-base font-semibold">CR/Customize Search</span>
            {session && (
              <>
                <a href="/" className="text-zinc-600 hover:text-zinc-950">
                  ค้นหา
                </a>
                <a href="/items" className="text-zinc-600 hover:text-zinc-950">
                  รายการทั้งหมด
                </a>
                {session.role === "admin" && (
                  <a href="/import" className="text-zinc-600 hover:text-zinc-950">
                    นำเข้าข้อมูล
                  </a>
                )}
                <a href="/history" className="text-zinc-600 hover:text-zinc-950">
                  ประวัติ
                </a>
                <span className="ml-auto flex items-center gap-4 text-zinc-500">
                  <span>
                    {session.username} ({session.role === "admin" ? "admin" : "user"})
                  </span>
                  <LogoutButton />
                </span>
              </>
            )}
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
