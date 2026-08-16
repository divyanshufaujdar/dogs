"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Sighting } from "@/lib/types";
import {
  CAMPUS_CENTER,
  CAMPUS_ZOOM,
  CAMPUS_BOUNDS,
  isInCampus,
} from "@/lib/constants";
import { addSighting } from "@/app/dogs/actions";

function dotIcon(kind: "latest" | "old" | "draft", danger = false) {
  // The pin you drop while logging: a clear red teardrop pointer.
  if (kind === "draft") {
    return L.divIcon({
      className: "",
      html: `<div class="cd-pointer">📍</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -30],
    });
  }
  // A red-flagged dog's pins are unmistakably "danger", not ordinary sightings
  // — the map should answer "where on campus should I be careful."
  const cls = danger
    ? `cd-pin cd-pin-danger ${kind === "latest" ? "cd-pin-latest" : ""}`
    : kind === "latest"
      ? "cd-pin cd-pin-latest"
      : "cd-pin cd-pin-old";
  const size = kind === "latest" ? 20 : 14;
  return L.divIcon({
    className: "",
    html: `<div class="${cls}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Fits the view to all sightings (plus any draft) whenever they change. */
function FitView({
  points,
}: {
  points: [number, number][];
}) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      map.setView(CAMPUS_CENTER, CAMPUS_ZOOM);
    } else if (points.length === 1) {
      map.setView(points[0], 17);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 18 });
    }
  }, [map, points]);
  return null;
}

const DANGER_RADIUS_M = 90;

function metersBetween(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Where the dog is seen MOST: the sighting with the most neighbours nearby. */
function densestSpot(pts: { lat: number; lng: number }[]): [number, number] | null {
  if (!pts.length) return null;
  let best = pts[0];
  let bestCount = -1;
  for (const s of pts) {
    const c = pts.filter(
      (o) => metersBetween([s.lat, s.lng], [o.lat, o.lng]) <= DANGER_RADIUS_M,
    ).length;
    if (c > bestCount) {
      bestCount = c;
      best = s;
    }
  }
  return [best.lat, best.lng];
}

function ClickToDrop({
  enabled,
  onDrop,
}: {
  enabled: boolean;
  onDrop: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) onDrop(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function SightingMapInner({
  dogId,
  sightings,
  canAdd,
  redFlagged = false,
  biteReports = 0,
}: {
  dogId: string;
  sightings: Sighting[];
  canAdd: boolean;
  redFlagged?: boolean;
  /** Distinct "bites" safety reports — >5 draws a red danger zone on the map. */
  biteReports?: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // sightings come newest-first; index 0 is the latest ("last found").
  const latestId = sightings[0]?.id;
  // Trail runs oldest → newest so the line reads as the dog's path.
  const chrono = [...sightings].reverse();
  const trail: [number, number][] = chrono.map((s) => [s.lat, s.lng]);
  const fitPoints: [number, number][] = draft
    ? [...trail, [draft.lat, draft.lng]]
    : trail;

  // >5 bite reports → mark the spot the dog is found most as a red danger zone.
  const showDangerZone = biteReports > 5 && sightings.length > 0;
  const dangerCenter = showDangerZone ? densestSpot(sightings) : null;

  async function submit() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const res = await addSighting({ dogId, lat: draft.lat, lng: draft.lng, note });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDraft(null);
    setNote("");
    router.refresh();
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={CAMPUS_CENTER}
          zoom={CAMPUS_ZOOM}
          maxBounds={CAMPUS_BOUNDS}
          maxBoundsViscosity={1}
          minZoom={15}
          style={{ height: 340, width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitView points={fitPoints} />

          {dangerCenter && (
            <Circle
              center={dangerCenter}
              radius={DANGER_RADIUS_M}
              pathOptions={{
                color: "#dc2626",
                fillColor: "#dc2626",
                fillOpacity: 0.25,
                weight: 2,
              }}
            >
              <Popup>
                <strong>⚠️ Bite danger zone</strong>
                <br />
                {biteReports} bite reports — this dog is found here most.
              </Popup>
            </Circle>
          )}

          <ClickToDrop
            enabled={canAdd}
            onDrop={(lat, lng) => {
              setError(isInCampus(lat, lng) ? null : "That spot is outside campus.");
              setDraft({ lat, lng });
            }}
          />

          {trail.length > 1 && (
            <Polyline
              positions={trail}
              pathOptions={{
                color: "#c76b2f",
                weight: 3,
                opacity: 0.7,
                dashArray: "6 8",
              }}
            />
          )}

          {sightings.map((s, i) => {
            const isLatest = s.id === latestId;
            const order = sightings.length - i; // chronological number
            return (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={dotIcon(isLatest ? "latest" : "old", redFlagged)}
                zIndexOffset={isLatest ? 1000 : 0}
              >
                <Popup>
                  <strong>
                    {isLatest ? "📍 Last found here" : `Sighting #${order}`}
                  </strong>
                  <br />
                  {new Date(s.created_at).toLocaleString()}
                  {s.note ? (
                    <>
                      <br />“{s.note}”
                    </>
                  ) : null}
                </Popup>
              </Marker>
            );
          })}

          {draft && <Marker position={[draft.lat, draft.lng]} icon={dotIcon("draft")} />}
        </MapContainer>

        {/* Count badge */}
        <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur">
          {sightings.length === 0
            ? "No sightings yet"
            : `${sightings.length} sighting${sightings.length === 1 ? "" : "s"} · trail shown`}
        </div>

        {/* Danger-zone legend */}
        {dangerCenter && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-sm">
            🚨 Bite danger zone
          </div>
        )}
      </div>

      {canAdd ? (
        draft ? (
          <div className="mt-3 space-y-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="Optional note (e.g. near the mess)"
              className="input"
            />
            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={busy || !isInCampus(draft.lat, draft.lng)}
                className="btn btn-brand"
              >
                {busy ? "Logging…" : "Log this sighting"}
              </button>
              <button
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">
            📍 Tap the map where you saw this dog to drop a pin and log a sighting.
          </p>
        )
      ) : (
        <p className="mt-2 text-xs text-muted">Sign in to report a sighting.</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
