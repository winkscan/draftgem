import { Fragment, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import Svg, { Defs, LinearGradient, Stop, Path, Line, Circle, Text as SvgText } from "react-native-svg";
import type { PricePoint } from "../pumpfantasy/chartData";
import { formatPrice } from "../pumpfantasy/format";
import { PF_COLORS as C } from "../theme";

const HEIGHT = 230;
const GUTTER = 66; // left space for y-axis labels
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28; // bottom space for x-axis labels
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
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = points.length;
    if (width === 0 || n < 2) return null;
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
    const plotW = width - GUTTER - PAD_R;
    const plotH = HEIGHT - PAD_T - PAD_B;
    const bottom = PAD_T + plotH;
    const xs = points.map((_, i) => GUTTER + (i / (n - 1)) * plotW);
    const ys = points.map((p) => PAD_T + (1 - (p.price - min) / (max - min)) * plotH);
    const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
    const area = `${line} L${xs[n - 1].toFixed(1)} ${bottom} L${xs[0].toFixed(1)} ${bottom} Z`;
    return { min, max, plotW, plotH, bottom, xs, ys, line, area };
  }, [width, points]);

  // The responder is created once; it reads the latest geometry through a ref.
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const countRef = useRef(points.length);
  countRef.current = points.length;

  const indexAt = (x: number): number | null => {
    const g = geoRef.current;
    const n = countRef.current;
    if (!g || n < 2) return null;
    const i = Math.round(((x - GUTTER) / g.plotW) * (n - 1));
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
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {geo ? (
        <Svg width={width} height={HEIGHT}>
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
                <Line x1={GUTTER} x2={width - PAD_R} y1={y} y2={y} stroke={C.cardBorder} strokeWidth={1} />
                <SvgText x={GUTTER - 6} y={y + 3} fontSize={9} fill={C.textSecondary} textAnchor="end">
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
                y={HEIGHT - 8}
                fontSize={9}
                fill={C.textSecondary}
                textAnchor={k === 0 ? "start" : k === 3 ? "end" : "middle"}
              >
                {xLabel(points[i].t)}
              </SvgText>
            );
          })}

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
          style={[styles.tooltip, { left: Math.max(GUTTER, Math.min(geo.xs[a] - TOOLTIP_W / 2, width - TOOLTIP_W - 4)) }]}
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
  wrap: { height: HEIGHT, width: "100%" },
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
