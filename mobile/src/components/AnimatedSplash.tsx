import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync().catch(() => {});

const ROTATION_MS = 1100;
const MIN_VISIBLE_MS = 1300;

// Shown right after the native splash (same black background + mark, so the
// handoff is invisible): the mark spins clockwise for a moment to read as
// "loading", then fades out to reveal the app underneath.
export function AnimatedSplash({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: ROTATION_MS, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        loop.stop();
        setHidden(true);
      });
    }, MIN_VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [opacity, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <>
      {children}
      {hidden ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]} pointerEvents="none">
          <Animated.Image
            source={require("../../assets/splash-icon.png")}
            style={[styles.mark, { transform: [{ rotate }] }]}
            resizeMode="contain"
          />
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  mark: { width: 140, height: 140 },
});
