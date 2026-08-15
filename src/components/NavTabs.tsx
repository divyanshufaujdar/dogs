"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <div className="ml-1 flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1 sm:ml-3">
      {tabs.map((t) => {
        const active =
          t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            <span aria-hidden>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
