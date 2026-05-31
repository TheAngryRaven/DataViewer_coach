import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

// Thin React wrapper around uPlot. uPlot (and its CSS) are imported here so they
// only enter the bundle once this lazy panel module is loaded — never on the
// host's initial load.

export interface UplotChartProps {
  data: uPlot.AlignedData;
  options: Omit<uPlot.Options, "width" | "height">;
  height: number;
}

export interface ChartMarker {
  /** x-axis value (distance, m) to draw the line at. */
  x: number;
  /** Short label drawn at the top of the line (e.g. "S2"). */
  label: string;
}

/**
 * uPlot plugin that draws dashed vertical reference lines at fixed x-values —
 * used for sector boundaries on the distance-axis charts. Drawn in the `draw`
 * hook so the lines sit over the series but inside the plot area.
 */
export function verticalMarkersPlugin(markers: ChartMarker[]): uPlot.Plugin {
  return {
    hooks: {
      draw: (u: uPlot) => {
        if (markers.length === 0) return;
        const { ctx } = u;
        const { top, height } = u.bbox;
        ctx.save();
        ctx.strokeStyle = "rgba(148,163,184,0.7)";
        ctx.fillStyle = "rgba(148,163,184,0.95)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.font = "600 10px sans-serif";
        ctx.textBaseline = "top";
        for (const marker of markers) {
          const cx = Math.round(u.valToPos(marker.x, "x", true));
          ctx.beginPath();
          ctx.moveTo(cx, top);
          ctx.lineTo(cx, top + height);
          ctx.stroke();
          ctx.fillText(marker.label, cx + 3, top + 2);
        }
        ctx.restore();
      },
    },
  };
}

export function UplotChart({ data, options, height }: UplotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  // Rebuild the plot when its structure (options/height) changes.
  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const width = el.clientWidth || 600;
    const plot = new uPlot({ ...options, width, height }, data, el);
    plotRef.current = plot;

    const observer = new ResizeObserver(() => {
      plot.setSize({ width: el.clientWidth || width, height });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, [options, height]);

  // Push new data without tearing down the plot.
  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data]);

  return <div ref={containerRef} style={{ width: "100%" }} />;
}
