import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Image, Pressable, StyleSheet, View } from "react-native";
import { Checkbox, Portal, Text, TouchableRipple } from "react-native-paper";
import { BlurView } from "expo-blur";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { PF_COLORS as C } from "../theme";

const DISMISSED_KEY = "draftgem.onboardingDismissed.v1";

// Explicit pixel height instead of the `aspectRatio` style: on-device an Image with aspectRatio ignored the
// container's width and fell back to its native pixel size (found the hard way in SwapKings). The app is
// portrait-locked, so the width is stable.
const CARD_WIDTH = Dimensions.get("window").width - 40;
const IMAGE_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);

// The four steps of a game, 16:9 pictures in assets/onboarding (onboarding-1..4.webp).
const STEPS = [
  {
    image: require("../../assets/onboarding/onboarding-1.webp"),
    title: "Pick a tournament",
    body: "Open the Lobby and choose a tournament. The entry fee is paid in SKR, and entries close the moment the round starts.",
  },
  {
    image: require("../../assets/onboarding/onboarding-2.webp"),
    title: "Build your portfolio",
    body: "Choose 5 coins within a 4,000 FP budget: calm coins are cheap, wild ones cost more. No time to think? Let the AI build it for you.",
  },
  {
    image: require("../../assets/onboarding/onboarding-3.webp"),
    title: "Play it live",
    body: "When the round starts, follow the standings live. Your score is the sum of your five coins' moves, so every swing counts.",
  },
  {
    image: require("../../assets/onboarding/onboarding-4.webp"),
    title: "Collect the results",
    body: "When the round ends the prizes are paid out on-chain to the winners. Check the final standings in Results.",
  },
] as const;

// Shown at app start unless "Don't show this again" was ticked. Mounted once at the navigation root so it
// appears whichever tab a new player lands on (same flow as SwapKings' onboarding).
export function OnboardingModal() {
  const navigation = useNavigation();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setVisible(v !== "1"))
      .catch(() => setVisible(true))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, opacity]);

  if (!ready || !visible) return null;

  const close = () => {
    if (dontShowAgain) AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => {});
    setVisible(false);
  };

  const isLastStep = step === STEPS.length - 1;
  const current = STEPS[step];

  const handlePrimary = () => {
    if (isLastStep) {
      close();
      // The Lobby lives inside the home tabs: a nested navigate.
      (navigation as any).navigate("HomeStack", { screen: "Lobby" });
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <Portal>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
        <BlurView intensity={45} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={styles.positioner} pointerEvents="box-none">
          <View style={styles.card}>
            <Pressable style={styles.closeBtn} onPress={close}>
              <FontAwesome6 name="xmark" size={14} color="#fff" />
            </Pressable>
            <Image source={current.image} style={styles.image} resizeMode="cover" />
            <View style={styles.body}>
              <View style={styles.progressRow}>
                {STEPS.map((_, i) => (
                  <View key={i} style={[styles.progressSeg, i <= step ? styles.progressSegActive : undefined]} />
                ))}
              </View>

              <Text style={styles.title}>{current.title}</Text>
              <Text style={styles.description}>{current.body}</Text>

              <TouchableRipple onPress={() => setDontShowAgain((v) => !v)} style={styles.checkboxRow}>
                <View style={styles.checkboxRowInner} pointerEvents="none">
                  <Checkbox status={dontShowAgain ? "checked" : "unchecked"} color={C.accent} />
                  <Text style={styles.checkboxLabel}>Don't show this again</Text>
                </View>
              </TouchableRipple>

              <View style={styles.actionsRow}>
                <TouchableRipple style={styles.skip} borderless onPress={close}>
                  <Text style={styles.skipText}>Skip</Text>
                </TouchableRipple>
                <TouchableRipple style={styles.primary} borderless onPress={handlePrimary}>
                  <View style={styles.primaryInner}>
                    <Text style={styles.primaryText}>{isLastStep ? "Let's play" : "Next"}</Text>
                    <FontAwesome6 name={isLastStep ? "gem" : "arrow-right"} size={13} color={C.accentTextOn} />
                  </View>
                </TouchableRipple>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  positioner: { flex: 1, justifyContent: "flex-start", paddingTop: 100, paddingHorizontal: 20 },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  image: { width: "100%", height: IMAGE_HEIGHT },
  body: { padding: 20 },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.glassStrong },
  progressSegActive: { backgroundColor: C.accent },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 18, marginBottom: 8 },
  description: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  checkboxRow: { marginLeft: -12, marginBottom: 4, borderRadius: 8 },
  checkboxRowInner: { flexDirection: "row", alignItems: "center" },
  checkboxLabel: { color: C.textSecondary, fontSize: 12 },
  actionsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  skip: { paddingHorizontal: 16, height: 44, borderRadius: 999, justifyContent: "center" },
  skipText: { color: C.textSecondary, fontWeight: "700", fontSize: 14 },
  primary: { height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: C.accent, justifyContent: "center" },
  primaryInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  primaryText: { color: C.accentTextOn, fontWeight: "800", fontSize: 14 },
});
