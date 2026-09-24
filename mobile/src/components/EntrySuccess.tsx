import { useState } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import type { Candidate } from "../pumpfantasy/candidates";
import type { TournamentAccount } from "../pumpfantasy/accounts";
import { WORKER_URL } from "../pumpfantasy/config";
import { PortfolioCard, entryBadge } from "./PortfolioCard";
import { BottomBar } from "./BottomBar";
import { PulseBadge } from "./PulseBadge";
import { PF_COLORS as C } from "../theme";

// Shown after a successful entry, like the "Tournament created" page: a big pulsing check, the
// congratulation, the portfolio just entered, the tournament link to copy, and where to go next.
export function EntrySuccess({
  tournament,
  entryNo,
  picks,
  onGoToLobby,
  onAnother,
}: {
  tournament: TournamentAccount;
  entryNo: number;
  picks: (Candidate | undefined)[];
  onGoToLobby: () => void;
  /** Multiple tournaments only: back to the draft for another portfolio. */
  onAnother?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = WORKER_URL + "/t/" + tournament.id.toString();

  // Copies with expo-clipboard; if that native module isn't in this build, falls back to the share sheet.
  const copyLink = async () => {
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Share.share({ message: url });
    }
  };

  return (
    <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <PulseBadge style={styles.badge}>
        <FontAwesome6 name="check" size={26} color={C.accent2TextOn} />
      </PulseBadge>
      <Text style={styles.title}>Congratulations!</Text>

      <View style={styles.cardWrap}>
        <PortfolioCard
          portfolioNo={entryNo}
          badge={entryBadge(tournament)}
          slots={picks.map((c, i) => ({ key: String(i), candidate: c }))}
        />
      </View>

      <TouchableRipple style={styles.linkBox} borderless onPress={copyLink}>
        <View style={styles.linkInner}>
          <FontAwesome6 name="link" size={13} color={C.accentText} />
          <Text style={styles.linkText} numberOfLines={2}>
            {url}
          </Text>
          <FontAwesome6 name={copied ? "check" : "copy"} size={15} color={copied ? C.accent2 : C.textSecondary} />
        </View>
      </TouchableRipple>
      <Text style={styles.copyHint}>{copied ? "Link copied" : "Tap the link to copy it"}</Text>

    </ScrollView>
    <BottomBar>
      {onAnother ? (
        <TouchableRipple style={styles.primary} borderless onPress={onAnother}>
          <Text style={styles.primaryText}>Create one more portfolio</Text>
        </TouchableRipple>
      ) : null}
      <TouchableRipple style={styles.whiteButton} borderless onPress={onGoToLobby}>
        <Text style={styles.whiteButtonText}>Go to lobby</Text>
      </TouchableRipple>
    </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  badge: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.accent2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 22, textAlign: "center", marginTop: 16 },
  cardWrap: { marginTop: 24 },
  linkBox: { marginTop: 16, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder },
  linkInner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  linkText: { color: C.textPrimary, fontSize: 13, flex: 1 },
  copyHint: { color: C.textSecondary, fontSize: 11, textAlign: "center", marginTop: 8 },
  whiteButton: { height: 52, borderRadius: 999, backgroundColor: C.textPrimary, justifyContent: "center", alignItems: "center" },
  whiteButtonText: { color: "#000000", fontWeight: "800", fontSize: 15 },
  primary: { height: 52, borderRadius: 999, backgroundColor: C.accent2, justifyContent: "center", alignItems: "center" },
  primaryText: { color: C.accent2TextOn, fontWeight: "800", fontSize: 15 },
});
