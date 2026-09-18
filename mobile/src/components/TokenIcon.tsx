import { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { dexscreenerIconUrl } from "../pumpfantasy/tokenInfo";
import { PF_COLORS as C } from "../theme";

// Ported directly from the SwapKings mobile app's TokenPill.tsx — same
// fallback chain, same failure-tracking approach. DexScreener's CDN (keyed
// only by mint, no lookup call) is tried first since Jupiter's own `icon`
// field often points at the original launchpad storage (arweave/irys/pump.fun's
// pinata), which 404s transiently even for tokens Jupiter currently indexes.
// Falls back to Jupiter's `icon`, then a plain letter circle. Don't
// reinvent this — SwapKings already burned real time getting it right.
export function TokenIcon({
  mint,
  icon,
  symbol,
  size,
}: {
  mint: string;
  icon?: string;
  symbol: string;
  size: number;
}) {
  const candidates = useMemo(() => {
    const list: string[] = [dexscreenerIconUrl(mint)];
    if (icon) list.push(icon);
    return list;
  }, [mint, icon]);
  const [index, setIndex] = useState(0);
  const [seenCandidates, setSeenCandidates] = useState(candidates);
  if (candidates.join("|") !== seenCandidates.join("|")) {
    setSeenCandidates(candidates);
    setIndex(0);
  }

  const uri = candidates[index];
  if (uri) {
    return (
      <Image
        key={uri}
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setIndex((i) => i + 1)}
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.fallbackLetter, { fontSize: size * 0.4 }]}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: C.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackLetter: { color: C.textSecondary, fontWeight: "700" },
});
