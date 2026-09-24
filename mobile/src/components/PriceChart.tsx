import { Fragment, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import Svg, { Defs, LinearGradient, Stop, Path, Line, Circle, Text as SvgText } from "react-native-svg";
import type { PricePoint } from "../pumpfantasy/chartData";
import { formatPrice } from "../pumpfantasy/format";
import { PF_COLORS as C } from "../theme";

// The chart fills whatever space it is given, edge to edge: every label sits inside the plot, over
// the gridlines / the filled area, and the fill runs down to the bottom edge.
const PAD_T = 44; // room above the highest price for the hint / tooltip
const PAD_B = 30; // the lowest price stays this far above the bottom edge, leaving room for x labels
const PAD_X = 20;
const TOOLTIP_W = 150;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const timeLabel = (t: number) => {
  const d = new Date(t * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const dateLabel = (t: number) => {
  const d = new Date(t * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

// Area chart drawn natively with react-native-svg from GeckoTerminal candle
// closes — press/drag anywhere on it for a date+price tooltip.
export function PriceChart({ points, color }: { points: PricePoint[]; color: string }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = points.length;
    if (width === 0 || height === 0 || n < 2) return null;
    const prices = points.map((p) => p.price);
    let min = Math.min(...prices);
    let max = Math.max(...prices);
    if (max === min) {
      max = min * 1.01 || 1;
      min = min * 0.99;
    }
    const margin = (max - min) * 0.08;
    min -= margin;
    max += margin;
    const plotW = width - 2 * PAD_X;
    const plotH = height - PAD_T - PAD_B;
    const bottom = PAD_T + plotH;
    const xs = points.map((_, i) => PAD_X + (i / (n - 1)) * plotW);
    const ys = points.map((p) => PAD_T + (1 - (p.price - min) / (max - min)) * plotH);
    const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
    const area = `${line} L${xs[n - 1].toFixed(1)} ${height} L${xs[0].toFixed(1)} ${height} Z`;
    return { min, max, plotW, plotH, bottom, xs, ys, line, area };
  }, [width, height, points]);

  // The responder is created once; it reads the latest geometry through a ref.
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const countRef = useRef(points.length);
  countRef.current = points.length;

  const indexAt = (x: number): number | null => {
    const g = geoRef.current;
    const n = countRef.current;
    if (!g || n < 2) return null;
    const i = Math.round(((x - PAD_X) / g.plotW) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setActive(indexAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setActive(indexAt(e.nativeEvent.locationX)),
      onPanResponderRelease: () => setActive(null),
      onPanResponderTerminate: () => setActive(null),
    }),
  ).current;

  const spanSec = points.length > 1 ? points[points.length - 1].t - points[0].t : 0;
  const xLabel = (t: number) => (spanSec <= 36 * 3600 ? timeLabel(t) : dateLabel(t));

  const a = geo && active != null && active < points.length ? active : null;

  return (
    <View style={styles.wrap} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {geo ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {[0, 1, 2, 3].map((k) => {
            const v = geo.max - (k * (geo.max - geo.min)) / 3;
            const y = PAD_T + (k / 3) * geo.plotH;
            return (
              <Fragment key={k}>
                <Line x1={0} x2={width} y1={y} y2={y} stroke={C.cardBorder} strokeWidth={1} />
                <SvgText x={8} y={y - 4} fontSize={9} fill={C.textSecondary} textAnchor="start">
                  {formatPrice(v)}
                </SvgText>
              </Fragment>
            );
          })}

          <Path d={geo.area} fill="url(#fill)" />
          <Path d={geo.line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />

          {[0, 1, 2, 3].map((k) => {
            const i = Math.round((k / 3) * (points.length - 1));
            return (
              <SvgText
                key={k}
                x={geo.xs[i]}
                y={height - 10}
                fontSize={9}
                fill={C.textSecondary}
                textAnchor={k === 0 ? "start" : k === 3 ? "end" : "middle"}
                dx={k === 0 ? 8 : k === 3 ? -8 : 0}
              >
                {xLabel(points[i].t)}
              </SvgText>
            );
          })}

          {a == null ? (
            <SvgText x={8} y={18} fontSize={11} fill={C.textSecondary}>
              Touch and drag on the chart to see the price at any moment.
            </SvgText>
          ) : null}

          {a != null ? (
            <>
              <Line x1={geo.xs[a]} x2={geo.xs[a]} y1={PAD_T} y2={geo.bottom} stroke={C.textSecondary} strokeWidth={1} strokeDasharray="3,3" />
              <Circle cx={geo.xs[a]} cy={geo.ys[a]} r={5} fill={color} stroke={C.textPrimary} strokeWidth={2} />
            </>
          ) : null}
        </Svg>
      ) : null}

      {geo && a != null ? (
        <View
          pointerEvents="none"
          style={[styles.tooltip, { left: Math.max(4, Math.min(geo.xs[a] - TOOLTIP_W / 2, width - TOOLTIP_W - 4)) }]}
        >
          <Text style={styles.tooltipText}>
            Date: {dateLabel(points[a].t)}, {timeLabel(points[a].t)}
          </Text>
          <Text style={styles.tooltipText}>Price: ${formatPrice(points[a].price)}</Text>
        </View>
      ) : null}

      {/* Transparent overlay owns the touches so locationX is relative to the chart, not an SVG child. */}
      <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: "100%" },
  tooltip: {
    position: "absolute",
    top: 6,
    width: TOOLTIP_W,
    backgroundColor: "#221f2e",
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tooltipText: { color: C.textPrimary, fontSize: 11 },
});
