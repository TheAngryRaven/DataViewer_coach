import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Course, GpsSample, Lap } from "@/types/racing";
import type { Corner } from "../analysis/corners";
import type { ApexOffset, CornerExit } from "../analysis/segments";
import type { CornerInsight, CornerRootCause } from "../analysis/coaching";
import { lapTrack, positionAtDistance } from "../analysis/distance";

// Offline-first race-line map. Draws the reference lap straight from GPS samples
// (no tiles required) and overlays the detected corners and apex points so you
// can see exactly what the segmentation is doing. Tiles are an optional online
// background. Raw Leaflet, driven imperatively (no react-leaflet).

const MPS_TO_KPH = 3.6;
const MPS_TO_MPH = 2.2369362920544;

const BASE_LINE = "#6b7280";
const GEO_COLOR = "#22d3ee";
const OFFSET_COLOR = "#a78bfa";
const EXIT_COLOR = "#22c55e";
const EXIT_DULL = "#94a3b8";

// Per-cause palette for colouring corners by what the attribution found.
export const CAUSE_COLOR: Record<CornerRootCause, string> = {
  low_min_speed: "#ef4444",
  scrubbing: "#f97316",
  unused_grip: "#eab308",
  inconsistent_apex: "#ec4899",
  corner_execution: "#94a3b8",
  none: "#64748b",
};
export const CAUSE_LABEL: Record<CornerRootCause, string> = {
  low_min_speed: "low minimum speed",
  scrubbing: "scrubbing",
  unused_grip: "unused grip",
  inconsistent_apex: "inconsistent apex",
  corner_execution: "execution (line/braking)",
  none: "on pace",
};
const NEUTRAL_CORNER = "#64748b";

interface CornerStyle {
  color: string;
  weight: number;
  opacity: number;
  dashArray?: string;
}

/** Corner-window style by attributed cause + confidence (low confidence -> dashed/advisory). */
function cornerStyle(insight: CornerInsight | undefined): CornerStyle {
  if (!insight) return { color: NEUTRAL_CORNER, weight: 4, opacity: 0.7 };
  const color = CAUSE_COLOR[insight.rootCause];
  if (insight.confidence === "low") return { color, weight: 5, opacity: 0.6, dashArray: "5 6" };
  if (insight.confidence === "medium") return { color, weight: 5, opacity: 0.85 };
  return { color, weight: 6, opacity: 0.95 };
}

// Host basemaps, used verbatim so the coach map matches the app (see brief).
const TILES = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
  },
} as const;

type TileMode = "off" | "dark" | "satellite";

export interface RaceLineMapProps {
  samples: GpsSample[];
  /** The lap whose geometry the corners/apex were computed on (the best lap). */
  lap: Lap;
  corners: Corner[];
  apex: ApexOffset[];
  exits: CornerExit[];
  insights: CornerInsight[];
  course: Course | null;
  useKph: boolean;
  height: number;
}

function numberIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};color:#111;font-size:12px;font-weight:700;box-shadow:0 0 0 2px rgba(0,0,0,0.4)">${label}</div>`,
  });
}

export function RaceLineMap({ samples, lap, corners, apex, exits, insights, course, useKph, height }: RaceLineMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const [tileMode, setTileMode] = useState<TileMode>("off");

  // Create the map once; clean up on unmount.
  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const map = L.map(el, { attributionControl: true });
    mapRef.current = map;
    overlayRef.current = L.layerGroup().addTo(map);
    map.invalidateSize();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      tileRef.current = null;
    };
  }, []);

  // Redraw the race line and overlays whenever the data changes.
  useEffect(() => {
    const map = mapRef.current;
    const group = overlayRef.current;
    if (map === null || group === null) return;
    group.clearLayers();

    const track = lapTrack(samples, lap);
    const latlngs = track.positions.map((p) => [p.lat, p.lon] as [number, number]);
    if (latlngs.length < 2) return;

    L.polyline(latlngs, { color: BASE_LINE, weight: 2, opacity: 0.7 }).addTo(group);

    const apexByCorner = new Map(apex.map((a) => [a.cornerIndex, a]));
    const exitByCorner = new Map(exits.map((e) => [e.cornerIndex, e]));
    const insightByCorner = new Map(insights.map((i) => [i.cornerIndex, i]));
    const fmtSpeed = (mps: number) =>
      useKph ? `${(mps * MPS_TO_KPH).toFixed(1)} km/h` : `${(mps * MPS_TO_MPH).toFixed(1)} mph`;

    for (const corner of corners) {
      const a = apexByCorner.get(corner.index);
      const exit = exitByCorner.get(corner.index);
      const insight = insightByCorner.get(corner.index);
      const style = cornerStyle(insight);
      const vMin = positionAtDistance(track, corner.apexDist);

      let header = `Corner ${corner.index + 1}`;
      if (a) {
        header +=
          a.kind === "on"
            ? " · on the apex"
            : ` · ${a.kind} apex ${a.offsetM > 0 ? "+" : "-"}${Math.abs(Math.round(a.offsetM))} m`;
      }
      let causeLine = "";
      if (insight) {
        causeLine = `<br/><span style="color:${style.color}">&#9656; ${CAUSE_LABEL[insight.rootCause]}</span> (${insight.confidence} confidence, +${(insight.timeLostMs / 1000).toFixed(2)}s)`;
      }
      let exitLine = "";
      if (exit) {
        exitLine = `<br/>Exit ${fmtSpeed(exit.exitSpeedMps)}`;
        if (exit.exitCritical) exitLine += ` &rarr; straight ${Math.round(exit.followingStraightM)} m`;
      }
      const popup = `<strong>${header}</strong>${causeLine}<br/>V-Min ${fmtSpeed(corner.minSpeedMps)}${exitLine}`;

      const segment = latlngs.filter(
        (_, i) => track.distances[i] >= corner.startDist && track.distances[i] <= corner.endDist,
      );
      if (segment.length >= 2) {
        L.polyline(segment, {
          color: style.color,
          weight: style.weight,
          opacity: style.opacity,
          dashArray: style.dashArray,
        })
          .bindPopup(popup)
          .addTo(group);
      }

      // Connector from V-Min to the geometric apex when the latter is well-defined.
      if (a?.confident) {
        const geo = positionAtDistance(track, a.geoApexDist);
        L.polyline(
          [
            [vMin.lat, vMin.lon],
            [geo.lat, geo.lon],
          ],
          { color: OFFSET_COLOR, weight: 2, dashArray: "4 4", opacity: 0.9 },
        ).addTo(group);
        L.circleMarker([geo.lat, geo.lon], {
          radius: 5,
          color: GEO_COLOR,
          weight: 2,
          fillColor: GEO_COLOR,
          fillOpacity: 0.25,
        })
          .bindPopup(`Corner ${corner.index + 1} · geometric apex (curvature peak)`)
          .addTo(group);
      }

      L.circleMarker([vMin.lat, vMin.lon], {
        radius: 5,
        color: style.color,
        weight: 2,
        fillColor: style.color,
        fillOpacity: 0.9,
      })
        .bindPopup(popup)
        .addTo(group);

      L.marker([vMin.lat, vMin.lon], { icon: numberIcon(String(corner.index + 1), style.color) })
        .bindPopup(popup)
        .addTo(group);

      // Exit point: green when a straight follows (exit speed compounds there).
      if (exit) {
        const exitPos = positionAtDistance(track, corner.endDist);
        const color = exit.exitCritical ? EXIT_COLOR : EXIT_DULL;
        L.circleMarker([exitPos.lat, exitPos.lon], {
          radius: 4,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.85,
        })
          .bindPopup(popup)
          .addTo(group);
      }
    }

    if (course !== null) {
      L.polyline(
        [
          [course.startFinishA.lat, course.startFinishA.lon],
          [course.startFinishB.lat, course.startFinishB.lon],
        ],
        { color: "#ffffff", weight: 2, dashArray: "6 4" },
      )
        .bindPopup("Start / finish")
        .addTo(group);
      for (const [label, line] of [
        ["S2", course.sector2],
        ["S3", course.sector3],
      ] as const) {
        if (!line) continue;
        L.polyline(
          [
            [line.a.lat, line.a.lon],
            [line.b.lat, line.b.lon],
          ],
          { color: "#ffffff", weight: 2, dashArray: "6 4" },
        )
          .bindPopup(`Sector boundary ${label}`)
          .addTo(group);
      }
    }

    map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
  }, [samples, lap, corners, apex, exits, course, useKph]);

  // Optional online tile background, under the race line.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    if (tileRef.current) {
      tileRef.current.remove();
      tileRef.current = null;
    }
    if (tileMode !== "off") {
      const tile = TILES[tileMode];
      tileRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: 21 }).addTo(map);
      tileRef.current.bringToBack();
    }
  }, [tileMode]);

  const modes: { value: TileMode; label: string }[] = [
    { value: "off", label: "Off" },
    { value: "dark", label: "Map" },
    { value: "satellite", label: "Satellite" },
  ];

  return (
    <div style={{ position: "relative", height }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, borderRadius: 8, overflow: "hidden" }} />
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 1000, display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,0,0,0.4)" }}>
        {modes.map((mode) => {
          const active = mode.value === tileMode;
          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => setTileMode(mode.value)}
              aria-pressed={active}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "4px 10px",
                fontSize: 12,
                background: active ? "#f59e0b" : "rgba(20,20,20,0.85)",
                color: active ? "#111" : "#eee",
                fontWeight: active ? 700 : 400,
              }}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
