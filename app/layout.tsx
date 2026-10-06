import type { Metadata } from "next";
import { Geist_Mono, IBM_Plex_Sans_Thai, Inter } from "next/font/google";
import AppShell from "@/components/AppShell";
import ToastProvider from "@/components/ToastProvider";
import { getSessionFromCookies } from "@/lib/session";
import "./globals.css";

// Inter for Latin/numerals, IBM Plex Sans Thai for Thai glyphs — the stack
// falls through per-character, so mixed Thai/English text stays in one
// consistent corporate typeface instead of the browser's default Thai font.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${inter.variable} ${plexThai.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full text-zinc-900">
        <ToastProvider>
          {session ? (
            <AppShell session={session}>{children}</AppShell>
          ) : (
            <main>{children}</main>
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
