import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { CORE_D, FACETS, G_D, MARK_H, MARK_W } from "./markData";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const FACET_FADE_MS = 260;
const FACET_STAGGER_MS = 130;
const CORE_DELAY_MS = 8 * FACET_STAGGER_MS + 60;
const CORE_MS = 420;

/** How long the whole reveal takes, so the splash knows when it may leave. */
export const MARK_REVEAL_MS = CORE_DELAY_MS + CORE_MS;

// The gem drawing itself: the eight facets fade in one after another, clockwise from the top right,
// and last the black core with the letter G pops in at the centre.
export function MarkReveal({ size = 120 }: { size?: number }) {
  const facets = useRef(FACETS.map(() => new Animated.Value(0))).current;
  const core = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const facetAnims = facets.map((v, i) =>
      Animated.timing(v, {
        toValue: 1,
        duration: FACET_FADE_MS,
        delay: i * FACET_STAGGER_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false, // SVG props aren't native-driver capable
      }),
    );
    const coreAnim = Animated.timing(core, {
      toValue: 1,
      duration: CORE_MS,
      delay: CORE_DELAY_MS,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    });
    Animated.parallel([...facetAnims, coreAnim]).start();
  }, [facets, core]);

  const width = (size * MARK_W) / MARK_H;
  const viewBox = `0 0 ${MARK_W} ${MARK_H}`;
  return (
    <View style={{ width, height: size }}>
      <Svg width={width} height={size} viewBox={viewBox} fill="none" style={StyleSheet.absoluteFill}>
        <Defs>
          {FACETS.map((f, i) => (
            <LinearGradient key={i} id={`revealFacet${i}`} x1={f.grad.x1} y1={f.grad.y1} x2={f.grad.x2} y2={f.grad.y2} gradientUnits="userSpaceOnUse">
              <Stop stopColor={f.grad.from} />
              <Stop offset="1" stopColor={f.grad.to} />
            </LinearGradient>
          ))}
        </Defs>
        {FACETS.map((f, i) => (
          <AnimatedPath key={i} d={f.d} fill={`url(#revealFacet${i})`} opacity={facets[i]} />
        ))}
      </Svg>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: core, transform: [{ scale: core.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] },
        ]}
      >
        <Svg width={width} height={size} viewBox={viewBox} fill="none">
          <Path d={CORE_D} fill="black" />
          <Path d={G_D} fill="white" />
        </Svg>
      </Animated.View>
    </View>
  );
}
