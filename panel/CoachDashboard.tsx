import { useMemo, useState, type ReactNode } from "react";
import type uPlot from "uplot";
import type { PluginPanelProps } from "@/plugins/panels";
import type { VehicleSetup } from "@/plugins/setup";
import { buildCoachingReport, type CoachingReport } from "../analysis/report";
import type { CornerMethod } from "../analysis/corners";
import type { CornerInsight, CornerRootCause } from "../analysis/coaching";
import { cornerInsightMessage } from "../analysis/coaching";
import type { BrakingPoint, SectorDelta, ThrottlePoint } from "../analysis/segments";
import type { TakeawayMessage } from "../analysis/debrief";
import { formatLapTimeMs, formatSpeed } from "../analysis/insights";
import { setupChangeMessage } from "../analysis/setupDiff";
import { formatDecimal, formatInteger } from "@/lib/i18n/format";
import { UplotChart, verticalMarkersPlugin, type ChartMarker } from "./UplotChart";
import { RaceLineMap, CAUSE_COLOR, CAUSE_KEYS } from "./RaceLineMap";
import { useCoachT, useCoachLocale } from "./i18n";

// Cause buckets in legend order; labels are resolved at render time via i18n.
const CAUSE_LEGEND = CAUSE_KEYS.map((cause) => ({ cause, color: CAUSE_COLOR[cause] }));

type CoachT = ReturnType<typeof useCoachT>;

/** Phrase the structured session takeaway via i18n (analysis emits the descriptor). */
function takeawayText(t: CoachT, locale: string, m: TakeawayMessage): string {
  switch (m.key) {
    case "noLaps":
      return t("takeaway.noLaps");
    case "oneLap":
      return t("takeaway.oneLap", { best: formatLapTimeMs(m.bestMs, locale) });
    case "inconsistent":
      return t("takeaway.inconsistent", {
        best: formatLapTimeMs(m.bestMs, locale),
        gap: formatDecimal(m.gapMs / 1000, locale, 1),
      });
    case "tight":
      return t("takeaway.tight", { stdev: formatDecimal(m.stdevMs / 1000, locale, 2) });
  }
}

/** Non-corner map overlays the driver can independently show/hide. */
interface MapLayers {
  apex: boolean;
  exits: boolean;
  sectors: boolean;
}
const DEFAULT_LAYERS: MapLayers = { apex: true, exits: true, sectors: true };

// Full-bleed (chromeless) Stage-1 dashboard for the Coach tab. A thin view over
// the pure `buildCoachingReport` analysis; no model, no network. Default-exported
// for `React.lazy` so uPlot stays out of the host's initial bundle.

const MPS_TO_KPH = 3.6;
const MPS_TO_MPH = 2.2369362920544;
const G_MPS2 = 9.80665;
const REFERENCE_STROKE = "#22d3ee";
const SUBJECT_STROKE = "#f59e0b";

export default function CoachDashboard(props: PluginPanelProps) {
  const t = useCoachT();
  const locale = useCoachLocale();
  const { data, laps, course, useKph } = props;
  const [cornerMethod, setCornerMethod] = useState<CornerMethod>("speed");
  // Legend toggles: causes the driver has switched off are hidden on the map.
  const [hiddenCauses, setHiddenCauses] = useState<ReadonlySet<CornerRootCause>>(new Set());
  // Independent show/hide for the non-corner map overlays.
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
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
      ? t("summary.referenceSnapshot", { time: formatLapTimeMs(report.snapshotReference.lapTimeMs, locale) })
      : t("summary.referenceBest", { lap: report.bestLapNumber ?? "?" });

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
      series.push({ label: t("chart.lap", { lap: report.subjectProfile.lapNumber }), stroke: SUBJECT_STROKE, width: 2 });
    }
    return {
      data: [report.grid, ...ys] as uPlot.AlignedData,
      options: {
        scales: { x: { time: false } },
        axes: [{ label: t("chart.distanceM") }, { label: t("chart.latG") }],
        series,
        legend: { show: true },
        plugins: markerPlugins,
      } satisfies Omit<uPlot.Options, "width" | "height">,
    };
  }, [report, referenceLabel, markerPlugins, t]);

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
      series.push({ label: t("chart.lap", { lap: report.subjectProfile.lapNumber }), stroke: SUBJECT_STROKE, width: 2 });
    }
    return {
      data: [xs, ...ys] as uPlot.AlignedData,
      options: {
        scales: { x: { time: false } },
        axes: [{ label: t("chart.distanceM") }, { label: t("chart.speedAxis", { unit: useKph ? "km/h" : "mph" }) }],
        series,
        legend: { show: true },
        plugins: markerPlugins,
      } satisfies Omit<uPlot.Options, "width" | "height">,
    };
  }, [report, useKph, referenceLabel, markerPlugins, t]);

  const deltaChart = useMemo(() => {
    if (report.deltaMs.length === 0) return null;
    const versus = report.referenceSource === "snapshot" ? t("chart.versusSnapshot") : t("chart.versusBest");
    return {
      data: [report.grid, report.deltaMs.map((ms) => ms / 1000)] as uPlot.AlignedData,
      options: {
        scales: { x: { time: false } },
        axes: [{ label: t("chart.distanceM") }, { label: t("chart.deltaAxis", { versus }) }],
        series: [
          {},
          {
            label: t("chart.deltaSeries", { lap: report.subjectLapNumber ?? "?", versus }),
            stroke: SUBJECT_STROKE,
            fill: "rgba(245,158,11,0.15)",
            width: 2,
          },
        ],
        legend: { show: true },
        plugins: markerPlugins,
      } satisfies Omit<uPlot.Options, "width" | "height">,
    };
  }, [report, markerPlugins, t]);

  if (data === null) return <Center>{t("states.loadSession")}</Center>;
  if (laps.length === 0) return <Center>{t("states.noLaps")}</Center>;

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
        <Section title={t("sections.setupChanges")}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {report.setupChanges.map((change) => {
              const m = setupChangeMessage(change, locale);
              const label = m.labelKey ? t(`setup.fields.${m.labelKey}`) : m.label;
              return (
                <li key={change.field}>
                  {m.delta !== null
                    ? t("setup.changeLineDelta", { label, before: m.before, after: m.after, delta: m.delta })
                    : t("setup.changeLine", { label, before: m.before, after: m.after })}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {report.setupChanges.length === 0 && report.baselineSetup !== null && (
        <BaselineSetupNote setup={report.baselineSetup} />
      )}

      {latGChart && (
        <Section title={t("sections.latG")}>
          <UplotChart data={latGChart.data} options={latGChart.options} height={180} />
        </Section>
      )}

      {speedChart && (
        <Section title={t("sections.speedTrace")}>
          <UplotChart data={speedChart.data} options={speedChart.options} height={220} />
        </Section>
      )}

      {deltaChart && (
        <Section title={t("sections.delta")}>
          <UplotChart data={deltaChart.data} options={deltaChart.options} height={180} />
        </Section>
      )}

      {report.insights.length > 0 && (
        <Section title={t("sections.sectorBreakdown")}>
          <CornerBreakdown report={report} useKph={useKph} />
        </Section>
      )}

      {report.apex.some((a) => a.confident) && (
        <Section title={t("sections.apexLine")}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {report.apex
              .filter((a) => a.confident)
              .map((a) => (
                <div
                  key={a.cornerIndex}
                  style={{ display: "flex", flexDirection: "column", padding: "4px 10px", borderRadius: 6, background: "rgba(127,127,127,0.12)" }}
                >
                  <span className="text-muted-foreground" style={{ fontSize: 12 }}>
                    {t("apex.corner", { corner: a.cornerIndex + 1 })}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: a.kind === "on" ? REFERENCE_STROKE : SUBJECT_STROKE }}>
                    {a.kind === "on"
                      ? t("apex.onApex")
                      : t("apex.offset", {
                          kind: a.kind === "early" ? t("apex.kindEarly") : t("apex.kindLate"),
                          sign: a.offsetM > 0 ? "+" : "-",
                          meters: formatInteger(Math.abs(Math.round(a.offsetM)), locale),
                        })}
                  </span>
                </div>
              ))}
          </div>
        </Section>
      )}

      {data !== null && bestLap !== null && (
        <Section title={t("sections.trackMap", { lap: bestLap.lapNumber })}>
          <p className="text-muted-foreground" style={{ fontSize: 12, margin: 0 }}>
            {t("map.legend")}
          </p>
          <CauseLegend hidden={hiddenCauses} onToggle={setHiddenCauses} />
          <LayerToggles layers={layers} onChange={setLayers} />
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
            showApex={layers.apex}
            showExits={layers.exits}
            showSectors={layers.sectors}
          />
        </Section>
      )}

      <DataQuality report={report} />
    </div>
  );
}

function Summary({ report, useKph }: { report: CoachingReport; useKph: boolean }) {
  const t = useCoachT();
  const locale = useCoachLocale();
  const { debrief, baselineDeltaMs } = report;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Chip label={t("summary.laps")} value={debrief.validLaps < debrief.lapsAnalysed ? `${debrief.validLaps}/${debrief.lapsAnalysed}` : `${debrief.lapsAnalysed}`} />
        {debrief.best && <Chip label={t("summary.best")} value={t("summary.bestValue", { time: formatLapTimeMs(debrief.best.lapTimeMs, locale), lap: debrief.best.lapNumber })} />}
        {baselineDeltaMs !== null && (
          <Chip
            label={t("summary.vsBaseline")}
            value={`${baselineDeltaMs >= 0 ? "+" : "-"}${formatDecimal(Math.abs(baselineDeltaMs / 1000), locale, 2)}s`}
            valueColor={baselineDeltaMs > 0 ? SUBJECT_STROKE : REFERENCE_STROKE}
          />
        )}
        {debrief.consistency && <Chip label={t("summary.consistency")} value={`±${formatDecimal(debrief.consistency.stdevMs / 1000, locale, 2)}s`} />}
        {debrief.theoreticalBestMs !== null && <Chip label={t("summary.theoretical")} value={formatLapTimeMs(debrief.theoreticalBestMs, locale)} />}
        {debrief.topSpeedMph !== null && debrief.topSpeedKph !== null && (
          <Chip label={t("summary.topSpeed")} value={formatSpeed(debrief.topSpeedMph, debrief.topSpeedKph, useKph, locale)} />
        )}
      </div>
      <p style={{ margin: 0 }}>{takeawayText(t, locale, debrief.takeaway)}</p>
    </div>
  );
}

function SnapshotBadge({
  reference,
}: {
  reference: NonNullable<CoachingReport["snapshotReference"]>;
}) {
  const t = useCoachT();
  const locale = useCoachLocale();
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
      <span style={{ color: REFERENCE_STROKE, fontWeight: 600 }}>{t("badges.comparedAgainst")}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {t("badges.comparedDetail", {
          engine: reference.engine,
          time: formatLapTimeMs(reference.lapTimeMs, locale),
          track: reference.trackName,
          course: reference.courseName,
        })}
      </span>
    </div>
  );
}

function BaselineSetupNote({ setup }: { setup: VehicleSetup }) {
  const t = useCoachT();
  const psi = [setup.psiFrontLeft, setup.psiFrontRight, setup.psiRearLeft, setup.psiRearRight];
  const knownPsi = psi.filter((v): v is number => typeof v === "number");
  const psiText =
    knownPsi.length === 4
      ? t("baselineSetup.psiAll", { values: psi.join(" / ") })
      : knownPsi.length > 0
      ? t("baselineSetup.psiSome", { values: knownPsi.join(" / ") })
      : null;
  const parts = [
    setup.tireBrand ? t("baselineSetup.tires", { brand: setup.tireBrand }) : null,
    psiText,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  return (
    <Section title={t("sections.baselineSetup")}>
      <p className="text-muted-foreground" style={{ margin: 0, fontSize: 13 }}>
        {t("baselineSetup.note")}
      </p>
      <p style={{ margin: 0, fontSize: 13 }}>{parts.join(" · ")}</p>
    </Section>
  );
}

function DataQuality({ report }: { report: CoachingReport }) {
  const t = useCoachT();
  const locale = useCoachLocale();
  const { capabilities, quality } = report;
  const parts = [
    quality.sampleRateHz > 0 ? t("quality.rateHz", { hz: formatInteger(Math.round(quality.sampleRateHz), locale) }) : t("quality.rateNa"),
    t("quality.gps", { level: quality.level }),
    quality.hdop !== null ? t("quality.hdop", { value: formatDecimal(quality.hdop, locale, 1) }) : null,
    quality.satellites !== null ? t("quality.sats", { count: formatInteger(Math.round(quality.satellites), locale) }) : null,
    capabilities.measuredG ? t("quality.measuredG") : t("quality.derivedG"),
    capabilities.throttle ? t("quality.throttle") : null,
    capabilities.brake ? t("quality.brake") : null,
    capabilities.rpm ? t("quality.rpm") : null,
  ].filter((x): x is string => x !== null);
  return (
    <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: "auto", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      <span>{parts.join(" · ")}</span>
      <span>{t("quality.note")}</span>
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
  const t = useCoachT();
  const options: { value: CornerMethod; label: string }[] = [
    { value: "speed", label: t("method.speed") },
    { value: "curvature", label: t("method.curvature") },
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
        {cornerCount === 1
          ? t("method.cornerDetected", { count: cornerCount })
          : t("method.cornersDetected", { count: cornerCount })}
      </span>
    </div>
  );
}

function BetaBadge() {
  const t = useCoachT();
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
        {t("badges.experimental")}
      </span>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
        {t("badges.experimentalCaption")}
      </span>
    </div>
  );
}

// Sits under the experimental badge, same pill-plus-caption shape: the
// GPS-derived advisory that used to be tagged onto every scrubbing / unused-grip
// line, hoisted to a single warning at the top.
function AdvisoryNote() {
  const t = useCoachT();
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
        {t("badges.advisory")}
      </span>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
        {t("badges.advisoryCaption")}
      </span>
    </div>
  );
}

// Corner notes grouped under their sector. When the course defines sector
// boundaries we place each corner by its apex distance and show the sector split
// (time : delta) as a header; otherwise we fall back to a flat, ranked list.
function CornerBreakdown({ report, useKph }: { report: CoachingReport; useKph: boolean }) {
  const t = useCoachT();
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
            <SectorHeader label={t(`sectors.${key}`)} delta={deltaByKey.get(key) ?? null} />
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
                  {t("breakdown.onBestPace")}
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
  const locale = useCoachLocale();
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
      {delta && (
        <span className="text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
          {formatLapTimeMs(delta.subjectMs, locale)}
          {" : "}
          <span style={{ color: delta.deltaMs > 0 ? SUBJECT_STROKE : REFERENCE_STROKE }}>
            {delta.deltaMs >= 0 ? "+" : "-"}
            {formatDecimal(Math.abs(delta.deltaMs / 1000), locale, 2)}s
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
  const t = useCoachT();
  const locale = useCoachLocale();
  const message = cornerInsightMessage(insight, useKph, locale);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span>{t(`insight.${message.key}`, message.params)}</span>
      <span className="text-muted-foreground" style={{ fontSize: 12 }}>
        {t("breakdown.confidence", { level: insight.confidence })}
        {braking?.brakingDistanceM != null ? t("breakdown.braking", { meters: formatInteger(Math.round(braking.brakingDistanceM), locale) }) : ""}
        {throttle?.throttleDist != null ? t("breakdown.throttle", { meters: formatInteger(Math.round(throttle.throttleDist), locale) }) : ""}
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
  const t = useCoachT();
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
            <span>{t(`causes.${entry.cause}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

// Show/hide the non-corner map overlays. Same button shape as the cause legend,
// with a swatch echoing how each overlay is drawn on the map.
function LayerToggles({ layers, onChange }: { layers: MapLayers; onChange: (next: MapLayers) => void }) {
  const t = useCoachT();
  const items: { key: keyof MapLayers; label: string; color: string }[] = [
    { key: "apex", label: t("layers.apex"), color: "#22d3ee" },
    { key: "exits", label: t("layers.exits"), color: "#22c55e" },
    { key: "sectors", label: t("layers.sectors"), color: "#e2e8f0" },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((item) => {
        const on = layers[item.key];
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange({ ...layers, [item.key]: !on })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: "1px solid rgba(127,127,127,0.3)",
              background: on ? "rgba(127,127,127,0.12)" : "transparent",
              color: "inherit",
              fontSize: 13,
              opacity: on ? 1 : 0.45,
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 999, border: `2px solid ${item.color}` }} />
            <span>{item.label}</span>
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
