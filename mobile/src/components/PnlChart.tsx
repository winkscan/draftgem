import { useMemo } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { PF_COLORS as C } from "../theme";

// A smooth profit/loss line with a soft fill under it: the line runs from purple to green (left to
// right), the fill fades out downwards. The vertical range always includes zero.
export function PnlChart({
  points,
  width,
  height,
  idPrefix,
}: {
  points: { t: number; v: number }[];
  width: number;
  height: number;
  /** Gradient ids must be unique per instance on screen. */
  idPrefix: string;
}) {
  const geo = useMemo(() => {
    if (width <= 0 || points.length < 2) return null;
    const vs = points.map((p) => p.v);
    let min = Math.min(0, ...vs);
    let max = Math.max(0, ...vs);
    if (max === min) {
      max = 1;
      min = -1;
    }
    const padY = 6;
    const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (height - 2 * padY);
    const xs = points.map((_, i) => (i / (points.length - 1)) * width);
    const ys = points.map((p) => y(p.v));
    // Smooth the steps with a Catmull-Rom curve turned into cubic Beziers.
    let d = "M" + xs[0].toFixed(1) + " " + ys[0].toFixed(1);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = Math.max(0, i - 1);
      const p3 = Math.min(points.length - 1, i + 2);
      const c1x = xs[i] + (xs[i + 1] - xs[p0]) / 6;
      const c1y = ys[i] + (ys[i + 1] - ys[p0]) / 6;
      const c2x = xs[i + 1] - (xs[p3] - xs[i]) / 6;
      const c2y = ys[i + 1] - (ys[p3] - ys[i]) / 6;
      d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + xs[i + 1].toFixed(1) + " " + ys[i + 1].toFixed(1);
    }
    const area = d + " L" + width.toFixed(1) + " " + height + " L0 " + height + " Z";
    return { d, area };
  }, [points, width, height]);

  if (!geo) return null;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={idPrefix + "Line"} x1="0" y1="0" x2={width} y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={C.accent} />
          <Stop offset="1" stopColor={C.positive} />
        </LinearGradient>
        <LinearGradient id={idPrefix + "Fill"} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.accent} stopOpacity={0.28} />
          <Stop offset="1" stopColor={C.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={geo.area} fill={"url(#" + idPrefix + "Fill)"} />
      <Path d={geo.d} stroke={"url(#" + idPrefix + "Line)"} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
