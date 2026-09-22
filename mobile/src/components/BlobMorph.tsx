import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import Svg, { Circle, Defs, Filter, FeGaussianBlur, FeColorMatrix, G } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CYCLE_MS = 2200;

// Two blobs (the mark's own mint/purple) drifting apart into the mark's resting dumbbell pose,
// then flowing back together into one — a "goo" filter (blur + contrast) fuses them into a single
// liquid shape whenever they're close, instead of two circles simply overlapping.
export function BlobMorph({ size = 108 }: { size?: number }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: CYCLE_MS / 2, useNativeDriver: false }),
        Animated.timing(t, { toValue: 0, duration: CYCLE_MS / 2, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  // 0 = merged into one blob at centre, 1 = separated into the mark's resting pose.
  // At t=0 the two circles still sit a little apart (not exactly on top of each other), so the
  // merged blob keeps a visible teal-into-purple blend instead of one colour fully hiding the other.
  const teal = { cx: t.interpolate({ inputRange: [0, 1], outputRange: [110, 132] }), cy: t.interpolate({ inputRange: [0, 1], outputRange: [90, 70] }) };
  const purple = { cx: t.interpolate({ inputRange: [0, 1], outputRange: [90, 68] }), cy: t.interpolate({ inputRange: [0, 1], outputRange: [110, 130] }) };
  const r = t.interpolate({ inputRange: [0, 1], outputRange: [58, 46] });

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <Filter id="goo" x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
          <FeColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
          />
        </Filter>
      </Defs>
      <G filter="url(#goo)">
        <AnimatedCircle cx={teal.cx} cy={teal.cy} r={r} fill="#40F4B8" />
        <AnimatedCircle cx={purple.cx} cy={purple.cy} r={r} fill="#7527F0" />
      </G>
    </Svg>
  );
}
