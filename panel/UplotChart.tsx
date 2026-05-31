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
 * uPlot plugin that draws bold dashed vertical reference lines at fixed x-values
 * — used for sector boundaries on the distance-axis charts. Drawn in the `draw`
 * hook so the lines sit over the series but inside the plot area. Sizes are
 * scaled by `uPlot.pxRatio` so the line stays heavy on high-DPI screens, and
 * each line carries a filled label chip so it reads on light or dark themes.
 */
export function verticalMarkersPlugin(markers: ChartMarker[]): uPlot.Plugin {
  const LINE = "#a855f7"; // vivid violet — distinct from the cyan/amber series
  return {
    hooks: {
      draw: (u: uPlot) => {
        if (markers.length === 0) return;
        const { ctx } = u;
        const { left, top, width, height } = u.bbox;
        const dpr = uPlot.pxRatio || 1;
        ctx.save();
        for (const marker of markers) {
          const cx = Math.round(u.valToPos(marker.x, "x", true));
          if (cx < left || cx > left + width) continue;

          ctx.strokeStyle = LINE;
          ctx.lineWidth = 2 * dpr;
          ctx.setLineDash([7 * dpr, 5 * dpr]);
          ctx.beginPath();
          ctx.moveTo(cx, top);
          ctx.lineTo(cx, top + height);
          ctx.stroke();

          // Filled label chip at the top of the line.
          ctx.setLineDash([]);
          ctx.font = `700 ${11 * dpr}px sans-serif`;
          ctx.textBaseline = "top";
          const padX = 4 * dpr;
          const padY = 2 * dpr;
          const tw = ctx.measureText(marker.label).width;
          const bw = tw + padX * 2;
          const bh = 11 * dpr + padY * 2;
          const bx = Math.min(cx + 3 * dpr, left + width - bw);
          const by = top + 2 * dpr;
          ctx.fillStyle = LINE;
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(marker.label, bx + padX, by + padY);
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
