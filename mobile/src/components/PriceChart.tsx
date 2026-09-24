import { Fragment, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import type { PricePoint } from "../pumpfantasy/chartData";
import { formatPrice } from "../pumpfantasy/format";
import { PF_COLORS as C } from "../theme";

// The chart fills whatever space it is given: every label sits inside the plot, over the gridlines,
// and the candles run from 20px in on the left to 20px in on the right, so the first and last
// candles are easy to touch.
const PAD_T = 44; // room above the highest price for the hint / tooltip
const PAD_B = 30; // the lowest price stays this far above the bottom edge, leaving room for x labels
const PAD_X = 20;
const TOOLTIP_W = 170;
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

// Candlestick chart drawn natively with react-native-svg from GeckoTerminal candles (green when the
// candle closed at or above its open, red otherwise). Press/drag anywhere for the candle's numbers.
export function PriceChart({ points }: { points: PricePoint[]; color?: string }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = points.length;
    if (width === 0 || height === 0 || n < 2) return null;
    let min = Math.min(...points.map((p) => p.low));
    let max = Math.max(...points.map((p) => p.high));
    if (max === min) {
      max = min * 1.01 || 1;
      min = min * 0.99;
    }
    const margin = (max - min) * 0.05;
    min -= margin;
    max += margin;
    const plotW = width - 2 * PAD_X;
    const plotH = height - PAD_T - PAD_B;
    const step = plotW / n;
    const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * plotH;
    const xs = points.map((_, i) => PAD_X + (i + 0.5) * step);
    return { min, max, plotW, plotH, step, xs, y };
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
    const i = Math.floor((x - PAD_X) / g.step);
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
  const bodyW = geo ? Math.max(1, Math.min(14, geo.step * 0.7)) : 1;

  return (
    <View style={styles.wrap} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {geo ? (
        <Svg width={width} height={height}>
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

          {points.map((p, i) => {
            const col = p.price >= p.open ? C.positive : C.negative;
            const x = geo.xs[i];
            const top = geo.y(Math.max(p.open, p.price));
            const bottom = geo.y(Math.min(p.open, p.price));
            return (
              <Fragment key={i}>
                <Line x1={x} x2={x} y1={geo.y(p.high)} y2={geo.y(p.low)} stroke={col} strokeWidth={1} />
                <Rect x={x - bodyW / 2} y={top} width={bodyW} height={Math.max(1, bottom - top)} fill={col} />
              </Fragment>
            );
          })}

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
              >
                {xLabel(points[i].t)}
              </SvgText>
            );
          })}

          {a == null ? (
            <SvgText x={8} y={18} fontSize={11} fill={C.textSecondary}>
              Touch and drag on the chart to see the price at any moment.
            </SvgText>
          ) : (
            <Line x1={geo.xs[a]} x2={geo.xs[a]} y1={PAD_T} y2={PAD_T + geo.plotH} stroke={C.textSecondary} strokeWidth={1} strokeDasharray="3,3" />
          )}
        </Svg>
      ) : null}

      {geo && a != null ? (
        <View
          pointerEvents="none"
          style={[styles.tooltip, { left: Math.max(4, Math.min(geo.xs[a] - TOOLTIP_W / 2, width - TOOLTIP_W - 4)) }]}
        >
          <Text style={styles.tooltipText}>
            {dateLabel(points[a].t)}, {timeLabel(points[a].t)}
          </Text>
          <Text style={styles.tooltipText}>
            O ${formatPrice(points[a].open)}  H ${formatPrice(points[a].high)}
          </Text>
          <Text style={styles.tooltipText}>
            L ${formatPrice(points[a].low)}  C ${formatPrice(points[a].price)}
          </Text>
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
    top: 4,
    width: TOOLTIP_W,
    backgroundColor: "#221f2e",
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tooltipText: { color: C.textPrimary, fontSize: 11 },
});
