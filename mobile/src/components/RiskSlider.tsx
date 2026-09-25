import { useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { PF_COLORS as C } from "../theme";

const TRACK_H = 4; // same thickness as the draft page's portfolio bar
const THUMB = 28;

// A slider with `steps` stops (drag or tap): a green-to-red track, a dot per stop, a white thumb.
export function RiskSlider({ value, steps, onChange }: { value: number; steps: number; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  widthRef.current = width;
  const change = useRef(onChange);
  change.current = onChange;

  const valueAt = (x: number) => {
    const w = widthRef.current - THUMB;
    if (w <= 0) return 0;
    const t = Math.max(0, Math.min(1, (x - THUMB / 2) / w));
    return Math.round(t * (steps - 1));
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => change.current(valueAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => change.current(valueAt(e.nativeEvent.locationX)),
    }),
  ).current;

  const usable = Math.max(0, width - THUMB);
  const xOf = (i: number) => THUMB / 2 + (usable * i) / (steps - 1);

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={THUMB}>
          <Defs>
            <LinearGradient id="riskTrack" x1="0" y1="0" x2={width} y2="0" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={C.positive} />
              <Stop offset="0.5" stopColor={C.accent} />
              <Stop offset="1" stopColor={C.negative} />
            </LinearGradient>
          </Defs>
          <Rect x={THUMB / 2} y={(THUMB - TRACK_H) / 2} width={usable} height={TRACK_H} rx={TRACK_H / 2} fill="url(#riskTrack)" />
          {Array.from({ length: steps }, (_, i) => (
            <Circle key={i} cx={xOf(i)} cy={THUMB / 2} r={3} fill="rgba(0,0,0,0.35)" />
          ))}
          <Circle cx={xOf(value)} cy={THUMB / 2} r={THUMB / 2 - 1} fill="#ffffff" />
        </Svg>
      ) : null}
      {/* Transparent overlay owns the touches so locationX is relative to the slider. */}
      <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: THUMB, alignSelf: "stretch" },
});
