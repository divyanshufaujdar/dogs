"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const initial: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : (document.documentElement.getAttribute("data-theme") as Theme | null) ??
          (window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light");
    setTheme(initial);
    // Apply a previously-saved preference on load.
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  // Avoid a hydration mismatch: render a stable placeholder until mounted.
  const label =
    theme === null ? "Theme" : theme === "dark" ? "Day mode" : "Night mode";
  const icon = theme === null ? "🌗" : theme === "dark" ? "☀️" : "🌙";

  return (
    <button
      onClick={toggle}
      aria-label="Toggle day / night mode"
      className="btn btn-ghost border border-border"
    >
      <span aria-hidden>{icon}</span> {label}
    </button>
  );
}
