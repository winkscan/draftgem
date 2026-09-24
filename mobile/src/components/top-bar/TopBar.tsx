import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple, ActivityIndicator } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useQuery } from "@tanstack/react-query";
import { useAuthorization } from "../../utils/useAuthorization";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { useConnection } from "../../utils/ConnectionProvider";
import { ellipsify, formatSol } from "../../pumpfantasy/format";
import { UpdateBadge } from "./UpdateBadge";
import { TournamentFilterSelects, TournamentFilterTabs } from "./TournamentFilterBar";
import { TournamentDetails } from "./TournamentDetails";
import { useNavigation } from "@react-navigation/native";
import type { TournamentAccount } from "../../pumpfantasy/accounts";
import type { TournamentMeta } from "../../pumpfantasy/customTournaments";
import { DraftGemLogo } from "../brand/DraftGemLogo";
import type { TournamentPhase } from "../../pumpfantasy/tournamentPhase";
import { PF_COLORS as C } from "../../theme";

// Matches the reference mockup's header: short address + SOL balance pill on
// the right: tapping it connects when there's no wallet yet, and opens the My Profile
// page once connected.
export function TopBar({
  phase,
  tournament,
}: {
  phase?: TournamentPhase;
  /** A tournament's own page: shows its details (and a back button) instead of the lobby's filters. */
  tournament?: {
    account: TournamentAccount;
    meta: TournamentMeta | undefined;
    onOpenInfo: () => void;
    tabs?: { items: { key: string; label: string }[]; active: string; onChange: (key: string) => void };
  };
}) {
  const navigation = useNavigation();
  const { selectedAccount } = useAuthorization();
  const { connect } = useMobileWallet();
  const { connection } = useConnection();

  const { data: balanceLamports, isFetching } = useQuery({
    queryKey: ["sol-balance", selectedAccount?.publicKey.toBase58()],
    queryFn: () => connection.getBalance(selectedAccount!.publicKey),
    enabled: !!selectedAccount,
    refetchInterval: 15_000,
  });

  return (
    <View>
      <View style={styles.panel}>
        {tournament ? null : (
          <View style={styles.bar}>
            <View style={styles.left}>
              <DraftGemLogo height={28} />
            </View>
            <View style={styles.right}>
              <UpdateBadge />
              <View>
                <TouchableRipple style={styles.pill} onPress={selectedAccount ? () => navigation.navigate("Profile") : connect} borderless>
                  {selectedAccount ? (
                    <View style={styles.pillContent}>
                      <Text style={styles.address}>{ellipsify(selectedAccount.publicKey)}</Text>
                      <View style={styles.divider} />
                      {isFetching && balanceLamports == null ? (
                        <ActivityIndicator size={10} color={C.textOnHeader} />
                      ) : (
                        <Text style={styles.balance}>{formatSol(balanceLamports ?? 0, 2)} SOL</Text>
                      )}
                      <FontAwesome6 name="wallet" size={12} color={C.textOnHeaderMuted} />
                    </View>
                  ) : (
                    <View style={styles.pillContent}>
                      <Text style={styles.balance}>Connect</Text>
                      <FontAwesome6 name="wallet" size={12} color={C.textOnHeader} />
                    </View>
                  )}
                </TouchableRipple>
              </View>
            </View>
          </View>
        )}
        {tournament ? (
          <TournamentDetails
            tournament={tournament.account}
            meta={tournament.meta}
            onOpenInfo={tournament.onOpenInfo}
            onBack={() => navigation.goBack()}
            tabs={tournament.tabs}
          />
        ) : phase ? (
          <TournamentFilterTabs />
        ) : null}
      </View>
      {phase ? <TournamentFilterSelects phase={phase} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-width panel in the border colour, so it sits visibly above the black
  // page; the filter tabs + chips live inside it, the selects hang just below.
  panel: { backgroundColor: C.headerPanel, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  // Spacing inside the panel: 16 at the sides, 12 above/below every row.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 6 },
  right: { flexDirection: "row", alignItems: "center", gap: 4 },
  pill: {
    backgroundColor: C.glassStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  address: { color: C.textOnHeader, fontSize: 12, fontWeight: "600" },
  divider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.24)" },
  balance: { color: C.textOnHeader, fontSize: 12, fontWeight: "700" },
});
