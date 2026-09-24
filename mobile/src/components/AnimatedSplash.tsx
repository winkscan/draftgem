import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { MarkReveal, MARK_REVEAL_MS } from "./brand/MarkReveal";

SplashScreen.preventAutoHideAsync().catch(() => {});

const MIN_VISIBLE_MS = MARK_REVEAL_MS + 900; // the reveal, then a short hold on the finished mark

// Shown right after the native splash (same black background, so the handoff is invisible):
// the gem draws itself facet by facet clockwise, the G appears in the middle, then the whole thing
// fades out to reveal the app underneath.
export function AnimatedSplash({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setHidden(true));
    }, MIN_VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [opacity]);

  return (
    <>
      {children}
      {hidden ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]} pointerEvents="none">
          <MarkReveal size={120} />
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
});
