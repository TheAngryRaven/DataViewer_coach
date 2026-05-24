import { useMemo, type ReactNode } from "react";
import type uPlot from "uplot";
import type { PluginPanelProps } from "@/plugins/panels";
import { buildCoachingReport, type CoachingReport } from "../analysis/report";
import { formatLapTimeMs, formatSpeed } from "../analysis/insights";
import { UplotChart } from "./UplotChart";

// Full-bleed (chromeless) Stage-1 dashboard for the Coach tab. A thin view over
// the pure `buildCoachingReport` analysis; no model, no network. Default-exported
// for `React.lazy` so uPlot stays out of the host's initial bundle.

const MPS_TO_KPH = 3.6;
const MPS_TO_MPH = 2.2369362920544;
const REFERENCE_STROKE = "#22d3ee";
const SUBJECT_STROKE = "#f59e0b";

export default function CoachDashboard(props: PluginPanelProps) {
  const { data, laps, useKph } = props;
  const report = useMemo(() => buildCoachingReport(props), [props]);

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
      <Summary report={report} useKph={useKph} />

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

      {report.topTimeLoss.length > 0 && (
        <Section title="Biggest time loss vs your best lap">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.topTimeLoss.map((corner) => {
              const braking = brakingByCorner.get(corner.cornerIndex);
              const throttle = throttleByCorner.get(corner.cornerIndex);
              const speedGap = corner.referenceMinSpeedMps - corner.subjectMinSpeedMps;
              return (
                <div key={corner.cornerIndex} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      Corner {corner.cornerIndex + 1}{" "}
                      <span className="text-muted-foreground">@ {Math.round(corner.apexDist)} m</span>
                    </span>
                    <span style={{ color: SUBJECT_STROKE, fontVariantNumeric: "tabular-nums" }}>
                      +{(corner.timeLostMs / 1000).toFixed(2)}s
                    </span>
                  </div>
                  <span className="text-muted-foreground" style={{ fontSize: 13 }}>
                    {speedGap > 0.1
                      ? `Carrying ${formatSpeed(speedGap * MPS_TO_MPH, speedGap * MPS_TO_KPH, useKph)} less at the apex`
                      : "Apex speed matches your best — losing it elsewhere in the corner"}
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
  const { capabilities, sampleRateHz } = report;
  const gNote = capabilities.measuredG
    ? "measured g"
    : capabilities.hasG
      ? "GPS-derived g (advisory)"
      : "no g channel";
  const extras = [
    capabilities.throttle ? "throttle" : null,
    capabilities.brake ? "brake" : null,
    capabilities.rpm ? "rpm" : null,
  ].filter((x): x is string => x !== null);
  return (
    <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: "auto", paddingTop: 8 }}>
      {sampleRateHz > 0 ? `${Math.round(sampleRateHz)} Hz` : "rate n/a"} · {gNote}
      {extras.length > 0 ? ` · ${extras.join(", ")}` : ""}
    </p>
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
