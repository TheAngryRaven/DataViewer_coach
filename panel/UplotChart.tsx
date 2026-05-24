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
