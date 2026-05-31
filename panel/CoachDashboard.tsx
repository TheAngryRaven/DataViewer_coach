import { useMemo, useState, type ReactNode } from "react";
import type uPlot from "uplot";
import type { PluginPanelProps } from "@/plugins/panels";
import type { VehicleSetup } from "@/plugins/setup";
import { buildCoachingReport, type CoachingReport } from "../analysis/report";
import type { CornerMethod } from "../analysis/corners";
import type { CornerInsight, CornerRootCause } from "../analysis/coaching";
import type { BrakingPoint, SectorDelta, ThrottlePoint } from "../analysis/segments";
import { formatLapTimeMs, formatSpeed } from "../analysis/insights";
import { describeCornerInsight } from "../analysis/coaching";
import { describeSetupChange } from "../analysis/setupDiff";
import { UplotChart, verticalMarkersPlugin, type ChartMarker } from "./UplotChart";
import { RaceLineMap, CAUSE_COLOR, CAUSE_LABEL } from "./RaceLineMap";

const CAUSE_LEGEND = (
  ["low_min_speed", "scrubbing", "unused_grip", "inconsistent_apex", "corner_execution"] as const
).map((cause) => ({ cause, color: CAUSE_COLOR[cause], label: CAUSE_LABEL[cause] }));

// Full-bleed (chromeless) Stage-1 dashboard for the Coach tab. A thin view over
// the pure `buildCoachingReport` analysis; no model, no network. Default-exported
// for `React.lazy` so uPlot stays out of the host's initial bundle.

const MPS_TO_KPH = 3.6;
const MPS_TO_MPH = 2.2369362920544;
const G_MPS2 = 9.80665;
const REFERENCE_STROKE = "#22d3ee";
const SUBJECT_STROKE = "#f59e0b";

export default function CoachDashboard(props: PluginPanelProps) {
  const { data, laps, course, useKph } = props;
  const [cornerMethod, setCornerMethod] = useState<CornerMethod>("speed");
  // Legend toggles: causes the driver has switched off are hidden on the map.
  const [hiddenCauses, setHiddenCauses] = useState<ReadonlySet<CornerRootCause>>(new Set());
  const report = useMemo(
    () => buildCoachingReport({ ...props, cornerMethod }),
    [props, cornerMethod],
  );
  const bestLap = useMemo(
    () => laps.find((lap) => lap.lapNumber === report.bestLapNumber) ?? null,
    [laps, report.bestLapNumber],
  );

  const toSpeed = (mps: number) => (useKph ? mps * MPS_TO_KPH : mps * MPS_TO_MPH);

  const referenceLabel =
    report.referenceSource === "snapshot" && report.snapshotReference
      ? `Snapshot (${formatLapTimeMs(report.snapshotReference.lapTimeMs)})`
      : `Best (lap ${report.bestLapNumber ?? "?"})`;

  // Sector 2/3 boundary lines, shared across every distance-axis chart.
  const sectorMarkers = useMemo<ChartMarker[]>(
    () =>
      report.sectorBoundaries.map((b) => ({
        x: b.distanceM,
        label: b.sector.toUpperCase(),
      })),
    [report.sectorBoundaries],
  );
  const markerPlugins = useMemo(
    () => (sectorMarkers.length > 0 ? [verticalMarkersPlugin(sectorMarkers)] : undefined),
    [sectorMarkers],
  );

  const latGChart = useMemo(() => {
    if (report.referenceProfile === null || report.referenceLatAccelMps2.length === 0) return null;
    const toG = (mps2: number) => mps2 / G_MPS2;
    const series: uPlot.Series[] = [
      {},
      { label: referenceLabel, stroke: REFERENCE_STROKE, width: 2 },
    ];
    const ys: number[][] = [report.referenceLatAccelMps2.map(toG)];
    if (
      report.subjectLatAccelMps2 &&
      report.subjectProfile &&
      report.subjectProfile !== report.referenceProfile
    ) {
      ys.push(report.subjectLatAccelMps2.map(toG));
      series.push({ label: `Lap ${report.subjectProfile.lapNumber}`, stroke: SUBJECT_STROKE, width: 2 });
    }
    return {
      data: [report.grid, ...ys] as uPlot.AlignedData,
      options: {
        scales: { x: { time: false } },
        axes: [{ label: "Distance (m)" }, { label: "Lateral g" }],
        series,
        legend: { show: true },
        plugins: markerPlugins,
      } satisfies Omit<uPlot.Options, "width" | "height">,
    };
  }, [report, referenceLabel, markerPlugins]);

  const speedChart = useMemo(() => {
    if (report.referenceProfile === null) return null;
    const xs = report.grid;
    const best = report.referenceProfile.speedMps.map(toSpeed);
    const series: uPlot.Series[] = [
      {},
      { label: referenceLabel, stroke: REFERENCE_STROKE, width: 2 },
    ];
    const ys: number[][] = [best];
    if (report.subjectProfile && report.subjectProfile !== report.referenceProfile) {
      ys.push(report.subjectProfile.speedMps.map(toSpeed));
      series.push({ label: `Lap ${report.subjectProfile.lapNumber}`, stroke: SUBJECT_STROKE, width: 2 });
    }
    return {
      data: [xs, ...ys] as uPlot.AlignedData,
      options: {
        scales: { x: { time: false } },
        axes: [{ label: "Distance (m)" }, { label: `Speed (${useKph ? "km/h" : "mph"})` }],
        series,
        legend: { show: true },
        plugins: markerPlugins,
      } satisfies Omit<uPlot.Options, "width" | "height">,
    };
  }, [report, useKph, referenceLabel, markerPlugins]);

  const deltaChart = useMemo(() => {
    if (report.deltaMs.length === 0) return null;
    const versus = report.referenceSource === "snapshot" ? "snapshot" : "best";
    return {
      data: [report.grid, report.deltaMs.map((ms) => ms / 1000)] as uPlot.AlignedData,
      options: {
        scales: { x: { time: false } },
        axes: [{ label: "Distance (m)" }, { label: `Δ time vs ${versus} (s)` }],
        series: [
          {},
          {
            label: `Lap ${report.subjectLapNumber ?? "?"} vs ${versus}`,
            stroke: SUBJECT_STROKE,
            fill: "rgba(245,158,11,0.15)",
            width: 2,
          },
        ],
        legend: { show: true },
        plugins: markerPlugins,
      } satisfies Omit<uPlot.Options, "width" | "height">,
    };
  }, [report, markerPlugins]);

  if (data === null) return <Center>Load a session to start coaching.</Center>;
  if (laps.length === 0) return <Center>No complete laps detected yet.</Center>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 16, height: "100%", overflowY: "auto" }}>
      <BetaBadge />
      <AdvisoryNote />
      {report.snapshotReference !== null && (
        <SnapshotBadge reference={report.snapshotReference} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Summary report={report} useKph={useKph} />
        <MethodToggle method={cornerMethod} onChange={setCornerMethod} cornerCount={report.corners.length} />
      </div>

      {report.setupChanges.length > 0 && (
        <Section title="Setup changes since baseline">
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {report.setupChanges.map((change) => (
              <li key={change.field}>{describeSetupChange(change)}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.setupChanges.length === 0 && report.baselineSetup !== null && (
        <BaselineSetupNote setup={report.baselineSetup} />
      )}

      {latGChart && (
        <Section title="Lateral g (cornering load)">
          <UplotChart data={latGChart.data} options={latGChart.options} height={180} />
        </Section>
      )}

      {speedChart && (
        <Section title="Speed trace">
          <UplotChart data={speedChart.data} options={speedChart.options} height={220} />
        </Section>
      )}

      {deltaChart && (
        <Section title="Where the time goes (delta to best)">
          <UplotChart data={deltaChart.data} options={deltaChart.options} height={180} />
        </Section>
      )}

      {report.insights.length > 0 && (
        <Section title="Where you're losing time (by sector)">
          <CornerBreakdown report={report} useKph={useKph} />
        </Section>
      )}

      {report.apex.some((a) => a.confident) && (
        <Section title="Apex line (V-Min vs geometric apex)">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {report.apex
              .filter((a) => a.confident)
              .map((a) => (
                <div
                  key={a.cornerIndex}
                  style={{ display: "flex", flexDirection: "column", padding: "4px 10px", borderRadius: 6, background: "rgba(127,127,127,0.12)" }}
                >
                  <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                    Corner {a.cornerIndex + 1}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: a.kind === "on" ? REFERENCE_STROKE : SUBJECT_STROKE }}>
                    {a.kind === "on"
                      ? "on the apex"
                      : `${a.kind} apex ${a.offsetM > 0 ? "+" : "-"}${Math.abs(Math.round(a.offsetM))} m`}
                  </span>
                </div>
              ))}
          </div>
        </Section>
      )}

      {data !== null && bestLap !== null && (
        <Section title={`Track map — corners & apex (best lap ${bestLap.lapNumber})`}>
          <p className="text-muted-foreground" style={{ fontSize: 12, margin: 0 }}>
            Corners are coloured by attributed cause (dashed = low-confidence /
            advisory). Cyan ring = geometric apex · dashed purple = apex offset ·
            green dot = exit onto a straight (grey = none). Tap a cause below to
            show/hide it; click any marker; toggle a satellite background top-right.
          </p>
          <CauseLegend hidden={hiddenCauses} onToggle={setHiddenCauses} />
          <RaceLineMap
            samples={data.samples}
            lap={bestLap}
            corners={report.corners}
            apex={report.apex}
            exits={report.exits}
            insights={report.insights}
            course={course}
            useKph={useKph}
            height={420}
            hiddenCauses={hiddenCauses}
          />
        </Section>
      )}

      <DataQuality report={report} />
    </div>
  );
}

function Summary({ report, useKph }: { report: CoachingReport; useKph: boolean }) {
  const { debrief, baselineDeltaMs } = report;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Chip label="Laps" value={debrief.validLaps < debrief.lapsAnalysed ? `${debrief.validLaps}/${debrief.lapsAnalysed}` : `${debrief.lapsAnalysed}`} />
        {debrief.best && <Chip label="Best" value={`${formatLapTimeMs(debrief.best.lapTimeMs)} (L${debrief.best.lapNumber})`} />}
        {baselineDeltaMs !== null && (
          <Chip
            label="vs baseline"
            value={`${baselineDeltaMs >= 0 ? "+" : "-"}${Math.abs(baselineDeltaMs / 1000).toFixed(2)}s`}
            valueColor={baselineDeltaMs > 0 ? SUBJECT_STROKE : REFERENCE_STROKE}
          />
        )}
        {debrief.consistency && <Chip label="Consistency" value={`±${(debrief.consistency.stdevMs / 1000).toFixed(2)}s`} />}
        {debrief.theoreticalBestMs !== null && <Chip label="Theoretical" value={formatLapTimeMs(debrief.theoreticalBestMs)} />}
        {debrief.topSpeedMph !== null && debrief.topSpeedKph !== null && (
          <Chip label="Top speed" value={formatSpeed(debrief.topSpeedMph, debrief.topSpeedKph, useKph)} />
        )}
      </div>
      <p style={{ margin: 0 }}>{debrief.takeaway}</p>
    </div>
  );
}

function SnapshotBadge({
  reference,
}: {
  reference: NonNullable<CoachingReport["snapshotReference"]>;
}) {
  return (
    <div
      style={{
        padding: "6px 12px",
        borderRadius: 6,
        background: "rgba(34,211,238,0.08)",
        border: "1px solid rgba(34,211,238,0.35)",
        fontSize: 13,
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "baseline",
      }}
    >
      <span style={{ color: REFERENCE_STROKE, fontWeight: 600 }}>Compared against:</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {reference.engine} · {formatLapTimeMs(reference.lapTimeMs)} · {reference.trackName} — {reference.courseName}
      </span>
    </div>
  );
}

function BaselineSetupNote({ setup }: { setup: VehicleSetup }) {
  const psi = [setup.psiFrontLeft, setup.psiFrontRight, setup.psiRearLeft, setup.psiRearRight];
  const knownPsi = psi.filter((v): v is number => typeof v === "number");
  const psiText =
    knownPsi.length === 4
      ? `PSI ${psi.join(" / ")} (FL / FR / RL / RR)`
      : knownPsi.length > 0
      ? `PSI ${knownPsi.join(" / ")}`
      : null;
  const parts = [
    setup.tireBrand ? `tires: ${setup.tireBrand}` : null,
    psiText,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  return (
    <Section title="Baseline setup">
      <p className="text-muted-foreground" style={{ margin: 0, fontSize: 13 }}>
        Frozen from the baseline lap — no live setup is assigned, so no diff is shown.
      </p>
      <p style={{ margin: 0, fontSize: 13 }}>{parts.join(" · ")}</p>
    </Section>
  );
}

function DataQuality({ report }: { report: CoachingReport }) {
  const { capabilities, quality } = report;
  const parts = [
    quality.sampleRateHz > 0 ? `${Math.round(quality.sampleRateHz)} Hz` : "rate n/a",
    `GPS ${quality.level}`,
    quality.hdop !== null ? `HDOP ${quality.hdop.toFixed(1)}` : null,
    quality.satellites !== null ? `${Math.round(quality.satellites)} sats` : null,
    capabilities.measuredG ? "measured g" : "GPS-derived g",
    capabilities.throttle ? "throttle" : null,
    capabilities.brake ? "brake" : null,
    capabilities.rpm ? "rpm" : null,
  ].filter((x): x is string => x !== null);
  return (
    <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: "auto", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      <span>{parts.join(" · ")}</span>
      <span>
        Scrubbing / unused-grip reads are GPS-derived (lateral g ≈ v²·κ) and
        advisory; confidence is capped by GPS quality. A chassis-mounted
        accelerometer would sharpen them — many kart loggers mount the sensor on
        the steering, which isn't ideal for this.
      </span>
    </div>
  );
}

function MethodToggle({
  method,
  onChange,
  cornerCount,
}: {
  method: CornerMethod;
  onChange: (method: CornerMethod) => void;
  cornerCount: number;
}) {
  const options: { value: CornerMethod; label: string }[] = [
    { value: "speed", label: "Speed (V-Min)" },
    { value: "curvature", label: "Curvature" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(127,127,127,0.3)" }}>
        {options.map((option) => {
          const active = option.value === method;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "5px 12px",
                fontSize: 13,
                background: active ? "rgba(34,211,238,0.2)" : "transparent",
                color: "inherit",
                fontWeight: active ? 600 : 400,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
        {cornerCount} corner{cornerCount === 1 ? "" : "s"} detected
      </span>
    </div>
  );
}

function BetaBadge() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 999,
          background: "rgba(234,179,8,0.16)",
          color: "#eab308",
          border: "1px solid rgba(234,179,8,0.4)",
        }}
      >
        Experimental analysis · beta
      </span>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
        deterministic, on-device — figures may shift as the analysis is tuned
      </span>
    </div>
  );
}

// Sits under the experimental badge, same pill-plus-caption shape: the
// GPS-derived advisory that used to be tagged onto every scrubbing / unused-grip
// line, hoisted to a single warning at the top.
function AdvisoryNote() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 999,
          background: "rgba(249,115,22,0.16)",
          color: "#f97316",
          border: "1px solid rgba(249,115,22,0.4)",
        }}
      >
        GPS-derived · advisory
      </span>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
        scrubbing &amp; unused-grip reads come from a GPS-derived friction circle
        (lateral g ≈ v²·κ) — directional, not absolute; a chassis accelerometer
        would sharpen them
      </span>
    </div>
  );
}

const SECTOR_LABELS: Record<SectorDelta["sector"], string> = {
  s1: "Sector 1",
  s2: "Sector 2",
  s3: "Sector 3",
};

// Corner notes grouped under their sector. When the course defines sector
// boundaries we place each corner by its apex distance and show the sector split
// (time : delta) as a header; otherwise we fall back to a flat, ranked list.
function CornerBreakdown({ report, useKph }: { report: CoachingReport; useKph: boolean }) {
  const brakingByCorner = new Map(report.braking.map((b) => [b.cornerIndex, b]));
  const throttleByCorner = new Map(report.throttle.map((t) => [t.cornerIndex, t]));
  const rowFor = (insight: CornerInsight) => (
    <InsightRow
      key={insight.cornerIndex}
      insight={insight}
      useKph={useKph}
      braking={brakingByCorner.get(insight.cornerIndex)}
      throttle={throttleByCorner.get(insight.cornerIndex)}
    />
  );

  const s2 = report.sectorBoundaries.find((b) => b.sector === "s2")?.distanceM ?? null;
  const s3 = report.sectorBoundaries.find((b) => b.sector === "s3")?.distanceM ?? null;

  // No boundaries to group by → the original flat, ranked list.
  if (s2 === null && s3 === null) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{report.insights.map(rowFor)}</div>;
  }

  const sectorOf = (apexDist: number): SectorDelta["sector"] => {
    if (s3 !== null && apexDist >= s3) return "s3";
    if (s2 !== null && apexDist >= s2) return "s2";
    return "s1";
  };
  const deltaByKey = new Map(report.sectorDeltas.map((d) => [d.sector, d]));
  const sectors: SectorDelta["sector"][] = ["s1", "s2", "s3"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {sectors.map((key) => {
        const insights = report.insights.filter((i) => sectorOf(i.apexDist) === key);
        return (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectorHeader label={SECTOR_LABELS[key]} delta={deltaByKey.get(key) ?? null} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                paddingLeft: 12,
                borderLeft: "2px solid rgba(127,127,127,0.25)",
              }}
            >
              {insights.length > 0 ? (
                insights.map(rowFor)
              ) : (
                <span className="text-muted-foreground" style={{ fontSize: 13 }}>
                  On your best pace through here.
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectorHeader({ label, delta }: { label: string; delta: SectorDelta | null }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
      {delta && (
        <span className="text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
          {formatLapTimeMs(delta.subjectMs)}
          {" : "}
          <span style={{ color: delta.deltaMs > 0 ? SUBJECT_STROKE : REFERENCE_STROKE }}>
            {delta.deltaMs >= 0 ? "+" : "-"}
            {Math.abs(delta.deltaMs / 1000).toFixed(2)}s
          </span>
        </span>
      )}
    </div>
  );
}

function InsightRow({
  insight,
  useKph,
  braking,
  throttle,
}: {
  insight: CornerInsight;
  useKph: boolean;
  braking: BrakingPoint | undefined;
  throttle: ThrottlePoint | undefined;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span>{describeCornerInsight(insight, useKph)}</span>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
        confidence: {insight.confidence}
        {braking?.brakingDistanceM != null ? ` · braking ${Math.round(braking.brakingDistanceM)} m out` : ""}
        {throttle?.throttleDist != null ? ` · back to throttle @ ${Math.round(throttle.throttleDist)} m` : ""}
      </span>
    </div>
  );
}

function CauseLegend({
  hidden,
  onToggle,
}: {
  hidden: ReadonlySet<CornerRootCause>;
  onToggle: (next: ReadonlySet<CornerRootCause>) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {CAUSE_LEGEND.map((entry) => {
        const off = hidden.has(entry.cause);
        return (
          <button
            key={entry.cause}
            type="button"
            aria-pressed={!off}
            onClick={() => {
              const next = new Set(hidden);
              if (off) next.delete(entry.cause);
              else next.add(entry.cause);
              onToggle(next);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: "1px solid rgba(127,127,127,0.3)",
              background: off ? "transparent" : "rgba(127,127,127,0.12)",
              color: "inherit",
              fontSize: 13,
              opacity: off ? 0.45 : 1,
            }}
          >
            <span style={{ width: 14, height: 6, borderRadius: 2, background: entry.color }} />
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

function Chip({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline", padding: "4px 10px", borderRadius: 6, background: "rgba(127,127,127,0.12)" }}>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: valueColor }}>{value}</span>
    </span>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
