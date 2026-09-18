import { useState } from "react";
import { StyleSheet } from "react-native";
import { Text, TouchableRipple, ActivityIndicator } from "react-native-paper";
import * as Updates from "expo-updates";
import { PF_COLORS as C } from "../../theme";

// Manual "check now" button, same pattern as SwapKings mobile's own
// UpdateBadge (real bug that pattern already fixed, 2026-09-11 there):
// checkForUpdateAsync() + "only fetch if available" can report "nothing
// new" even when expo-updates' own background check already DOWNLOADED a
// newer bundle without ever applying it — the app keeps running the old JS
// and the badge lies. fetchUpdateAsync() is always safe to call (a no-op
// when there's truly nothing newer) and reloadAsync() actually switches to
// whatever's latest, whether just-fetched or sitting there from an earlier
// background check. Swipe-close-reopen alone does not reliably pick up a
// published `eas update` — this button is the actual fix, not cosmetic.
export function UpdateBadge() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const label = Updates.isEmbeddedLaunch
    ? "build (no OTA)"
    : `upd ${(Updates.updateId ?? "").slice(0, 8)}`;

  const onPress = async () => {
    setChecking(true);
    setStatus("Checking…");
    try {
      await Updates.fetchUpdateAsync();
      setStatus("Restarting…");
      await Updates.reloadAsync();
      // reloadAsync tears the app down — nothing after this line runs.
    } catch (err) {
      setStatus(err instanceof Error ? err.message.slice(0, 40) : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <TouchableRipple onPress={onPress} disabled={checking} style={styles.wrap} borderless>
      <>
        {checking ? <ActivityIndicator size={10} color={C.textOnHeader} style={styles.spinner} /> : null}
        <Text variant="labelSmall" style={styles.text}>
          {status ?? label}
        </Text>
      </>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  spinner: {
    marginRight: 4,
  },
  text: {
    color: C.textOnHeaderMuted,
  },
});
