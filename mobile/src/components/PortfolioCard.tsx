import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import type { Candidate } from "../pumpfantasy/candidates";
import type { TournamentAccount } from "../pumpfantasy/accounts";
import { ChartModal } from "./ChartModal";
import { TokenIcon } from "./TokenIcon";
import { PF_COLORS as C } from "../theme";

// A coin in a portfolio slot: icon, symbol, FP price (or the coin's result, when `pct` is given) and
// category. Used for the slots being drafted (with a remove button) and for finished portfolios.
export function SlotCard({
  candidate: c,
  onRemove,
  pct,
  compact,
  onPressCoin,
}: {
  candidate: Candidate | undefined;
  /** Shows the red remove button on the card's top-right corner. */
  onRemove?: () => void;
  /** The coin's result in %, shown instead of its FP price (results / live). */
  pct?: { text: string; tone: "up" | "down" | "pending" };
  /** No room reserved for the remove button's overhang. */
  compact?: boolean;
  /** Tapping the coin opens something about it (its chart). */
  onPressCoin?: () => void;
}) {
  return (
    // The wrapper reserves room for the remove button, which overhangs the card's top-right corner
    // (Android ignores taps outside a parent's bounds, so the overhang must stay inside the wrapper).
    <View style={[styles.slotWrap, compact ? styles.slotWrapCompact : undefined]}>
      <TouchableRipple style={styles.slot} borderless disabled={!(c && onPressCoin)} onPress={onPressCoin}>
        <>
        {c ? (
          <>
            <TokenIcon mint={c.mint} icon={c.icon} symbol={c.symbol} size={28} />
            <Text style={styles.slotName} numberOfLines={1} ellipsizeMode="tail">
              {c.symbol}
            </Text>
            <Text
              style={[
                styles.slotFp,
                pct ? { color: pct.tone === "up" ? C.positive : pct.tone === "down" ? C.negative : C.textSecondary } : undefined,
              ]}
              numberOfLines={1}
            >
              {pct ? pct.text : c.fpCost + " FP"}
            </Text>
            <View style={styles.slotDivider} />
            <Text style={styles.slotCategory} numberOfLines={1}>
              {c.tier}
            </Text>
          </>
        ) : !compact ? (
          <>
            {/* Invisible copy of a filled card's content, so an empty slot is exactly as tall. */}
            <View style={styles.slotGhost}>
              <View style={{ width: 28, height: 28 }} />
              <Text style={styles.slotName}> </Text>
              <Text style={styles.slotFp}> </Text>
              <View style={styles.slotDivider} />
              <Text style={styles.slotCategory}> </Text>
            </View>
            <Text style={styles.slotEmptyLabel}>Empty</Text>
          </>
        ) : (
          <Text style={styles.slotName}>?</Text>
        )}
        </>
      </TouchableRipple>
      {c && onRemove ? (
        <TouchableRipple style={styles.slotRemove} borderless onPress={onRemove}>
          <FontAwesome6 name="xmark" size={11} color="#fff" />
        </TouchableRipple>
      ) : null}
    </View>
  );
}

export type BadgeTone = "neutral" | "positive" | "negative" | "live" | "accent" | "white";

/** The status badge of an entry: Live while the round runs, grey while waiting, green once paid out. */
export function entryBadge(t: Pick<TournamentAccount, "status" | "startTs" | "endTs">): { label: string; tone: BadgeTone } {
  if (t.status === "finalized") return { label: "Paid Out", tone: "positive" };
  if (t.status === "cancelled") return { label: "Refunded", tone: "neutral" };
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(t.startTs)) return { label: "Upcoming", tone: "neutral" };
  if (now < Number(t.endTs)) return { label: "Live", tone: "live" };
  return { label: "Awaiting results", tone: "neutral" };
}

function toneStyles(tone: BadgeTone): { bg: object | undefined; text: object | undefined } {
  switch (tone) {
    case "positive":
      return { bg: { backgroundColor: C.positive }, text: { color: C.accent2TextOn } };
    case "negative":
      return { bg: { backgroundColor: C.negative }, text: { color: "#fff" } };
    case "live":
      return { bg: { backgroundColor: C.accent2Tint }, text: { color: C.accent2 } };
    case "white":
      return { bg: { backgroundColor: "#ffffff" }, text: { color: "#000000" } };
    case "accent":
      return { bg: { backgroundColor: C.accentTint }, text: { color: C.accentText } };
    default:
      return { bg: undefined, text: undefined };
  }
}

function Badge({ label, tone, icon }: { label: string; tone: BadgeTone; icon?: string }) {
  const t = toneStyles(tone);
  return (
    <View style={[styles.badge, icon ? styles.badgeWithIcon : undefined, t.bg]}>
      {icon ? <FontAwesome6 name={icon} size={10} color={(t.text as { color?: string } | undefined)?.color ?? C.textSecondary} /> : null}
      <Text style={[styles.badgeText, t.text]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A finished / entered portfolio: one bordered block, a title row (name, optional small badges right
 * after it, and a status / result badge on the far right) and the five coins right under it, looking
 * exactly like the draft page's slots. The one component every place that shows a portfolio uses.
 */
export function PortfolioCard({
  title,
  titleIcon,
  portfolioNo,
  titleBadges,
  badge,
  slots,
  footer,
  onPress,
}: {
  /** A player's address, shown as a white badge with a user icon. Ignored when `portfolioNo` is given. */
  title?: string;
  /** The icon of the title badge (default: a user, for an address). */
  titleIcon?: string;
  /** Shown as a white badge: briefcase icon and the number. */
  portfolioNo?: number;
  /** Small badges right after the title (place, prize). */
  titleBadges?: { label: string; tone: BadgeTone; icon?: string }[];
  badge: { label: string; tone: BadgeTone };
  slots: { key: string; candidate: Candidate | undefined; pct?: { text: string; tone: "up" | "down" | "pending" } }[];
  /** Extra content under the coins (the payout link). */
  footer?: React.ReactNode;
  onPress?: () => void;
}) {
  // Tapping a coin opens its chart popup.
  const [chartCoin, setChartCoin] = useState<Candidate | null>(null);
  const content = (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          {portfolioNo != null ? (
            <Badge label={String(portfolioNo)} tone="white" icon="briefcase" />
          ) : title ? (
            <Badge label={title} tone="white" icon={titleIcon ?? "user"} />
          ) : null}
          {titleBadges?.map((b) => (
            <Badge key={b.label} label={b.label} tone={b.tone} icon={b.icon} />
          ))}
        </View>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <View style={styles.slots}>
        {slots.map((sl) => (
          <SlotCard
            key={sl.key}
            candidate={sl.candidate}
            pct={sl.pct}
            compact
            onPressCoin={sl.candidate ? () => setChartCoin(sl.candidate!) : undefined}
          />
        ))}
      </View>
      {footer}
      <ChartModal candidate={chartCoin} onClose={() => setChartCoin(null)} />
    </View>
  );
  return onPress ? (
    <TouchableRipple borderless style={styles.pressable} onPress={onPress}>
      {content}
    </TouchableRipple>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 12, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titleWrap: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  pressable: { borderRadius: 16 },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 15 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: C.glassStrong },
  badgeWithIcon: { flexDirection: "row", alignItems: "center", gap: 5 },
  badgeText: { color: C.textSecondary, fontWeight: "700", fontSize: 12 },
  slots: { flexDirection: "row", gap: 6 },

  slotWrap: { flex: 1, paddingTop: 8, paddingRight: 6 },
  slotWrapCompact: { paddingTop: 0, paddingRight: 0 },
  slot: {
    flexGrow: 1, // not flex:1: its zero basis would collapse the card to minHeight and eat the padding
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 1,
  },
  slotName: { color: C.textPrimary, fontWeight: "800", fontSize: 14, alignSelf: "stretch", textAlign: "center", marginTop: 3 },
  slotGhost: { opacity: 0, alignItems: "center", alignSelf: "stretch", gap: 1 },
  slotEmptyLabel: { position: "absolute", color: C.textSecondary, fontSize: 12 },
  slotFp: { color: C.accentText, fontSize: 11, fontWeight: "600" },
  slotDivider: { height: 1, alignSelf: "stretch", marginHorizontal: 6, marginVertical: 4, backgroundColor: C.cardBorder },
  slotCategory: { color: C.textSecondary, fontSize: 11 },
  slotRemove: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.negative,
    alignItems: "center",
    justifyContent: "center",
  },
});
