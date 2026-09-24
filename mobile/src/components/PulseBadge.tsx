import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

// The big round icon on the result screens: pops up bigger, then settles, for a bit of life.
export function PulseBadge({ children, style }: { children: React.ReactNode; style: object }) {
  const scale = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
