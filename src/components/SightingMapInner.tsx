"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Sighting } from "@/lib/types";
import { CAMPUS_CENTER, CAMPUS_ZOOM, CAMPUS_BOUNDS, isInCampus } from "@/lib/constants";
import { addSighting } from "@/app/dogs/actions";

function pawIcon(highlight: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:${highlight ? 26 : 18}px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))">${highlight ? "📍" : "🐾"}</div>`,
    iconSize: [highlight ? 26 : 18, highlight ? 26 : 18],
    iconAnchor: [highlight ? 13 : 9, highlight ? 26 : 18],
  });
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

  // newest first → index 0 is the latest ("last found").
  const latestId = sightings[0]?.id;

  async function submit() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const res = await addSighting({
      dogId,
      lat: draft.lat,
      lng: draft.lng,
      note,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDraft(null);
    setNote("");
    router.refresh();
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <MapContainer
          center={CAMPUS_CENTER}
          zoom={CAMPUS_ZOOM}
          maxBounds={CAMPUS_BOUNDS}
          maxBoundsViscosity={1}
          minZoom={15}
          style={{ height: 320, width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToDrop
            enabled={canAdd}
            onDrop={(lat, lng) => {
              setError(isInCampus(lat, lng) ? null : "That spot is outside campus.");
              setDraft({ lat, lng });
            }}
          />
          {sightings.map((s) => (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={pawIcon(s.id === latestId)}
            >
              <Popup>
                <strong>{s.id === latestId ? "Last found here" : "Seen here"}</strong>
                <br />
                {new Date(s.created_at).toLocaleString()}
                {s.note ? <><br />“{s.note}”</> : null}
              </Popup>
            </Marker>
          ))}
          {draft && <Marker position={[draft.lat, draft.lng]} icon={pawIcon(true)} />}
        </MapContainer>
      </div>

      {canAdd ? (
        draft ? (
          <div className="mt-3 space-y-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="Optional note (e.g. near the mess)"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={busy || !isInCampus(draft.lat, draft.lng)}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {busy ? "Logging…" : "Log this sighting"}
              </button>
              <button
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            Tap the map where you saw this dog to log a sighting.
          </p>
        )
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Sign in to report a sighting.</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
