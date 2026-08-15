"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
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

function dotIcon(kind: "latest" | "old" | "draft") {
  const cls =
    kind === "latest"
      ? "cd-pin cd-pin-latest"
      : kind === "draft"
        ? "cd-draft"
        : "cd-pin cd-pin-old";
  const size = kind === "old" ? 14 : 20;
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
}: {
  dogId: string;
  sightings: Sighting[];
  canAdd: boolean;
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
                icon={dotIcon(isLatest ? "latest" : "old")}
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
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur">
          {sightings.length === 0
            ? "No sightings yet"
            : `${sightings.length} sighting${sightings.length === 1 ? "" : "s"} · trail shown`}
        </div>
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
            🟢 Tap the map where you saw this dog to log a sighting.
          </p>
        )
      ) : (
        <p className="mt-2 text-xs text-muted">Sign in to report a sighting.</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
