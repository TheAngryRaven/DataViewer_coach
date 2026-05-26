import { useMemo, useState, type ReactNode } from "react";
import type uPlot from "uplot";
import type { PluginPanelProps } from "@/plugins/panels";
import { buildCoachingReport, type CoachingReport } from "../analysis/report";
import type { CornerMethod } from "../analysis/corners";
import { formatLapTimeMs, formatSpeed } from "../analysis/insights";
import { describeCornerInsight } from "../analysis/coaching";
import { UplotChart } from "./UplotChart";
import { RaceLineMap, CAUSE_COLOR, CAUSE_LABEL } from "./RaceLineMap";

const CAUSE_LEGEND = (
  ["low_min_speed", "scrubbing", "unused_grip", "inconsistent_apex", "corner_execution"] as const
).map((cause) => ({ color: CAUSE_COLOR[cause], label: CAUSE_LABEL[cause] }));

// Full-bleed (chromeless) Stage-1 dashboard for the Coach tab. A thin view over
// the pure `buildCoachingReport` analysis; no model, no network. Default-exported
// for `React.lazy` so uPlot stays out of the host's initial bundle.

const MPS_TO_KPH = 3.6;
const MPS_TO_MPH = 2.2369362920544;
const REFERENCE_STROKE = "#22d3ee";
const SUBJECT_STROKE = "#f59e0b";

export default function CoachDashboard(props: PluginPanelProps) {
  const { data, laps, course, useKph } = props;
  const [cornerMethod, setCornerMethod] = useState<CornerMethod>("speed");
  const report = useMemo(
    () => buildCoachingReport({ ...props, cornerMethod }),
    [props, cornerMethod],
  );
  const bestLap = useMemo(
    () => laps.find((lap) => lap.lapNumber === report.bestLapNumber) ?? null,
    [laps, report.bestLapNumber],
  );

  const toSpeed = (mps: number) => (useKph ? mps * MPS_TO_KPH : mps * MPS_TO_MPH);

  const speedChart = useMemo(() => {
    if (report.referenceProfile === null) return null;
    const xs = report.grid;
    const best = report.referenceProfile.speedMps.map(toSpeed);
    const series: uPlot.Series[] = [
      {},
      { label: `Best (lap ${report.bestLapNumber ?? "?"})`, stroke: REFERENCE_STROKE, width: 2 },
    ];
    const ys: number[][] = [best];
    if (report.subjectProfile && report.subjectProfile.lapNumber !== report.bestLapNumber) {
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
      } satisfies Omit<uPlot.Options, "width" | "height">,
    };
  }, [report, useKph]);

  const deltaChart = useMemo(() => {
    if (report.deltaMs.length === 0) return null;
    return {
      data: [report.grid, report.deltaMs.map((ms) => ms / 1000)] as uPlot.AlignedData,
      options: {
        scales: { x: { time: false } },
        axes: [{ label: "Distance (m)" }, { label: "Δ time vs best (s)" }],
        series: [
          {},
          {
            label: `Lap ${report.subjectLapNumber ?? "?"} vs best`,
            stroke: SUBJECT_STROKE,
            fill: "rgba(245,158,11,0.15)",
            width: 2,
          },
        ],
        legend: { show: true },
      } satisfies Omit<uPlot.Options, "width" | "height">,
    };
  }, [report]);

  if (data === null) return <Center>Load a session to start coaching.</Center>;
  if (laps.length === 0) return <Center>No complete laps detected yet.</Center>;

  const brakingByCorner = new Map(report.braking.map((b) => [b.cornerIndex, b]));
  const throttleByCorner = new Map(report.throttle.map((t) => [t.cornerIndex, t]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 16, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Summary report={report} useKph={useKph} />
        <MethodToggle method={cornerMethod} onChange={setCornerMethod} cornerCount={report.corners.length} />
      </div>

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
        <Section title="Where you're losing time (attributed)">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {report.insights.slice(0, 3).map((insight) => {
              const braking = brakingByCorner.get(insight.cornerIndex);
              const throttle = throttleByCorner.get(insight.cornerIndex);
              return (
                <div key={insight.cornerIndex} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>{describeCornerInsight(insight, useKph)}</span>
                  <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                    confidence: {insight.confidence}
                    {braking?.brakingDistanceM != null
                      ? ` · braking ${Math.round(braking.brakingDistanceM)} m out`
                      : ""}
                    {throttle?.throttleDist != null
                      ? ` · back to throttle @ ${Math.round(throttle.throttleDist)} m`
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
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
            green dot = exit onto a straight (grey = none). Click any marker;
            toggle a satellite background top-right.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {CAUSE_LEGEND.map((entry) => (
              <span key={entry.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <span style={{ width: 12, height: 4, borderRadius: 2, background: entry.color }} />
                <span className="text-muted-foreground">{entry.label}</span>
              </span>
            ))}
          </div>
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
          />
        </Section>
      )}

      {report.sectorDeltas.length > 0 && (
        <Section title="Sector deltas vs best">
          <div style={{ display: "flex", gap: 24 }}>
            {report.sectorDeltas.map((sector) => (
              <div key={sector.sector} style={{ display: "flex", flexDirection: "column" }}>
                <span className="text-muted-foreground" style={{ textTransform: "uppercase", fontSize: 12 }}>
                  {sector.sector}
                </span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: sector.deltaMs > 0 ? SUBJECT_STROKE : REFERENCE_STROKE,
                  }}
                >
                  {sector.deltaMs >= 0 ? "+" : "-"}
                  {Math.abs(sector.deltaMs / 1000).toFixed(2)}s
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <DataQuality report={report} />
    </div>
  );
}

function Summary({ report, useKph }: { report: CoachingReport; useKph: boolean }) {
  const { debrief } = report;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Chip label="Laps" value={debrief.validLaps < debrief.lapsAnalysed ? `${debrief.validLaps}/${debrief.lapsAnalysed}` : `${debrief.lapsAnalysed}`} />
        {debrief.best && <Chip label="Best" value={`${formatLapTimeMs(debrief.best.lapTimeMs)} (L${debrief.best.lapNumber})`} />}
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline", padding: "4px 10px", borderRadius: 6, background: "rgba(127,127,127,0.12)" }}>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{value}</span>
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
