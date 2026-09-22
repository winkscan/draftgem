import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Defs, Filter, FeGaussianBlur, FeColorMatrix, G, LinearGradient, Stop } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const HALF_CYCLE_MS = 1400;

// Centre of the mark's own diagonal, and each blob's offset from it at rest (matches the
// static mark's pose: teal top-right, purple bottom-left).
const CENTER = { x: 100, y: 100 };
const OFFSET = { x: 32, y: -30 };

// The two blobs slide toward each other along the mark's diagonal, fuse into one shape as they
// cross, and keep going — landing swapped (teal where purple was, and back) — then slide back
// the same way. A "goo" filter (blur + contrast) is what turns the crossing into a real liquid
// merge instead of two circles just passing behind one another.
export function BlobMorph({ size = 108 }: { size?: number }) {
  const s = useRef(new Animated.Value(1)).current; // +1 = resting pose, -1 = swapped, 0 = mid-cross

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(s, { toValue: -1, duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(s, { toValue: 1, duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [s]);

  const teal = {
    cx: s.interpolate({ inputRange: [-1, 1], outputRange: [CENTER.x - OFFSET.x, CENTER.x + OFFSET.x] }),
    cy: s.interpolate({ inputRange: [-1, 1], outputRange: [CENTER.y - OFFSET.y, CENTER.y + OFFSET.y] }),
  };
  const purple = {
    cx: s.interpolate({ inputRange: [-1, 1], outputRange: [CENTER.x + OFFSET.x, CENTER.x - OFFSET.x] }),
    cy: s.interpolate({ inputRange: [-1, 1], outputRange: [CENTER.y + OFFSET.y, CENTER.y - OFFSET.y] }),
  };
  // Bigger while crossing (reads as one fused blob), smaller at rest — same range as before.
  const r = s.interpolate({ inputRange: [-1, 0, 1], outputRange: [46, 58, 46] });

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        {/* Each blob's own gradient runs from its base colour (outer side, away from the other
            blob) to the mark's neck blue (inner side, facing the other blob) — since both blobs
            always travel the same straight line through the centre, a fixed diagonal direction
            is correct for every position along the animation, not just at rest. */}
        <LinearGradient id="tealGradient" x1="100%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#D6FFF0" />
          <Stop offset="55%" stopColor="#40F4B8" />
          <Stop offset="100%" stopColor="#4A83F3" />
        </LinearGradient>
        <LinearGradient id="purpleGradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#D9C4FF" />
          <Stop offset="55%" stopColor="#7527F0" />
          <Stop offset="100%" stopColor="#4A83F3" />
        </LinearGradient>
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
        <AnimatedCircle cx={teal.cx} cy={teal.cy} r={r} fill="url(#tealGradient)" />
        <AnimatedCircle cx={purple.cx} cy={purple.cy} r={r} fill="url(#purpleGradient)" />
      </G>
    </Svg>
  );
}
