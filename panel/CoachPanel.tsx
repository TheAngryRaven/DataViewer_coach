import type { PluginPanelProps } from "@/plugins/panels";
import {
  deltaToFastest,
  fastestLap,
  findLap,
  formatDelta,
  formatLapTime,
} from "@/analysis/insights";

/**
 * First coaching read for the Labs tab. The host renders this inside a titled
 * card and an error boundary, so we return only the body.
 */
export function CoachPanel({ data, laps, selectedLapNumber }: PluginPanelProps) {
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

  const best = fastestLap(laps);
  const selected = findLap(laps, selectedLapNumber);
  const delta = deltaToFastest(laps, selectedLapNumber);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Laps analysed</span>
        <span className="text-foreground tabular-nums">{laps.length}</span>
      </div>

      {best !== null && (
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Session best</span>
          <span className="text-foreground font-semibold tabular-nums">
            {formatLapTime(best.lapTime)}
            <span className="text-muted-foreground"> (lap {best.lapNumber})</span>
          </span>
        </div>
      )}

      {selected !== null && delta !== null && (
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            Lap {selected.lapNumber} vs best
          </span>
          <span className="text-foreground tabular-nums">
            {delta === 0 ? "session best" : formatDelta(delta)}
          </span>
        </div>
      )}
    </div>
  );
}
