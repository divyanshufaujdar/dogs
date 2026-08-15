import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Nav from "@/components/Nav";
import ThemeToggle from "@/components/ThemeToggle";
import DangerAlerts from "@/components/DangerAlerts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Campus Dogs — BITS Pilani",
  description:
    "A community directory for BITS Pilani campus dogs: photos, name votes, sightings, and temperament.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Suspense
          fallback={
            <div className="h-[61px] border-b border-border" />
          }
        >
          <Nav />
        </Suspense>
        <div className="flex flex-1 flex-col">{children}</div>
        <DangerAlerts />
        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-6 py-6 text-sm text-muted sm:flex-row">
            <span className="flex items-center gap-2">
              <span aria-hidden>🐾</span> Campus Dogs — for the strays of BITS
              Pilani
            </span>
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline">
                Made by students, for the good boys &amp; girls
              </span>
              <ThemeToggle />
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
