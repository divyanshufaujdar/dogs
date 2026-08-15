"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { nearbyDangerAlerts } from "@/app/dogs/actions";
import type { DangerAlert } from "@/lib/types";

// Foreground proximity alerts (Phase 7 v1): while the tab is open and the user
// has explicitly opted in, watch their position and warn them when they're
// near a recent sighting of a red-flagged dog. Privacy model: coordinates are
// sent per-check, used, and discarded — nothing is ever stored server-side.

const OPT_IN_KEY = "cd-danger-alerts";
const MIN_MOVE_METERS = 20;
const MIN_INTERVAL_MS = 60_000;

/** Flat-earth meters between two points — fine at campus scale. */
function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const mPerDegLat = 111_320;
  const mPerDegLng = mPerDegLat * Math.cos((a.lat * Math.PI) / 180);
  const dLat = (a.lat - b.lat) * mPerDegLat;
  const dLng = (a.lng - b.lng) * mPerDegLng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

const TOGGLE_EVENT = "cd-danger-alerts-change";

function subscribeToToggle(cb: () => void) {
  window.addEventListener(TOGGLE_EVENT, cb);
  return () => window.removeEventListener(TOGGLE_EVENT, cb);
}

export default function DangerAlerts() {
  // localStorage-backed opt-in, read SSR-safely (server renders "off").
  const enabled = useSyncExternalStore(
    subscribeToToggle,
    () => localStorage.getItem(OPT_IN_KEY) === "on",
    () => false,
  );
  const [alerts, setAlerts] = useState<DangerAlert[]>([]);
  const lastCheck = useRef<{ at: number; lat: number; lng: number } | null>(null);
  // (dogId:sightingId) pairs already shown this session — walking near the
  // same spot for ten minutes shouldn't re-fire the same warning.
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const prev = lastCheck.current;
        const now = Date.now();
        // Only re-check on a meaningful change: moved >20m or >60s elapsed.
        if (
          prev &&
          now - prev.at < MIN_INTERVAL_MS &&
          metersBetween(here, prev) < MIN_MOVE_METERS
        ) {
          return;
        }
        lastCheck.current = { at: now, ...here };

        nearbyDangerAlerts(here.lat, here.lng).then((res) => {
          if (!res.ok) return;
          const fresh = res.data.alerts.filter((a) => {
            const key = `${a.dogId}:${a.sightingId}`;
            if (seen.current.has(key)) return false;
            seen.current.add(key);
            return true;
          });
          if (fresh.length > 0) setAlerts((cur) => [...cur, ...fresh]);
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  function toggle() {
    localStorage.setItem(OPT_IN_KEY, enabled ? "off" : "on");
    window.dispatchEvent(new Event(TOGGLE_EVENT));
    if (enabled) setAlerts([]);
  }

  return (
    <div className="fixed bottom-4 right-4 z-[900] flex flex-col items-end gap-2">
      {alerts.map((a) => (
        <div
          key={`${a.dogId}:${a.sightingId}`}
          role="alert"
          className="flex max-w-xs items-start gap-3 rounded-xl border border-red-500/50 bg-surface p-4 shadow-[var(--shadow)]"
        >
          <span className="text-xl">🚩</span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-red-700 dark:text-red-300">
              Dangerous dog nearby
            </p>
            <p className="mt-0.5 text-ink">
              <Link href={`/dogs/${a.dogId}`} className="underline">
                {a.topName ?? "A red-flagged dog"}
              </Link>{" "}
              was seen ~{Math.round(a.distanceMeters)}m from you,{" "}
              {new Date(a.lastSeenAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          </div>
          <button
            aria-label="Dismiss"
            onClick={() =>
              setAlerts((cur) =>
                cur.filter(
                  (x) => !(x.dogId === a.dogId && x.sightingId === a.sightingId),
                ),
              )
            }
            className="text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        onClick={toggle}
        title="Warns you when you're near a recent sighting of a red-flagged dog. Your location is checked live and never stored."
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors ${
          enabled
            ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
            : "border-border bg-surface/90 text-muted hover:text-ink"
        }`}
      >
        🚨 Danger alerts: {enabled ? "on" : "off"}
      </button>
    </div>
  );
}
