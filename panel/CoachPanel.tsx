import type { ReactNode } from "react";
import type { PluginPanelProps } from "@/plugins/panels";
import { buildDebrief } from "../analysis/debrief";
import { buildSession } from "../analysis/session";
import { formatLapTimeMs, formatSpeed } from "../analysis/insights";

/**
 * The session-level debrief for the host's Coach tab. The host wraps this in a
 * titled card and an error boundary, so we return only the body.
 */
export function CoachPanel({ data, laps, useKph }: PluginPanelProps) {
  if (data === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Load a session to start coaching.
      </p>
    );
  }

  if (laps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No complete laps detected yet.
      </p>
    );
  }

  const debrief = buildDebrief(buildSession(data, laps));

  return (
    <div className="flex flex-col gap-3">
      <Row label="Laps analysed">
        <span className="text-foreground tabular-nums">
          {debrief.validLaps < debrief.lapsAnalysed
            ? `${debrief.validLaps} valid / ${debrief.lapsAnalysed}`
            : debrief.lapsAnalysed}
        </span>
      </Row>

      {debrief.best !== null && (
        <Row label="Session best">
          <span className="text-foreground font-semibold tabular-nums">
            {formatLapTimeMs(debrief.best.lapTimeMs)}
            <span className="text-muted-foreground">
              {" "}
              (lap {debrief.best.lapNumber})
            </span>
          </span>
        </Row>
      )}

      {debrief.consistency !== null && (
        <Row label="Consistency (±1σ)">
          <span className="text-foreground tabular-nums">
            ±{(debrief.consistency.stdevMs / 1000).toFixed(2)}s
            <span className="text-muted-foreground">
              {" "}
              (spread {(debrief.consistency.spreadMs / 1000).toFixed(2)}s)
            </span>
          </span>
        </Row>
      )}

      {debrief.theoreticalBestMs !== null && (
        <Row label="Theoretical best">
          <span className="text-foreground tabular-nums">
            {formatLapTimeMs(debrief.theoreticalBestMs)}
            <span className="text-muted-foreground"> (stitched best sectors)</span>
          </span>
        </Row>
      )}

      {debrief.topSpeedMph !== null && debrief.topSpeedKph !== null && (
        <Row label="Top speed">
          <span className="text-foreground tabular-nums">
            {formatSpeed(debrief.topSpeedMph, debrief.topSpeedKph, useKph)}
          </span>
        </Row>
      )}

      <p className="text-sm text-foreground border-t border-border pt-3 mt-1">
        {debrief.takeaway}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
