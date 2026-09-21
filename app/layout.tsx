import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
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
          <AppShell session={session}>{children}</AppShell>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
