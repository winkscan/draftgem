import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { PF_COLORS as C } from "../theme";

// The Guide's knowledge base. To add a topic, append an entry here — the Guide
// screen renders every entry as an accordion item, nothing else to wire up.
export interface GuideTopic {
  id: string;
  title: string;
  /** FontAwesome6 icon name shown next to the title. */
  icon: string;
  body: ReactNode;
}

// Keep in sync with worker/src/tiers.ts (the server owns the real thresholds
// and FP prices; this is only the explanation of them).
const CATEGORIES = [
  { name: "Hold", move: "under 0.5%", fp: 100, blurb: "Barely moves. Cheap, steady filler for your portfolio." },
  { name: "Farm", move: "0.5% – 1%", fp: 300, blurb: "A slow crawl. Small gains and small losses." },
  { name: "Pump", move: "1% – 2%", fp: 650, blurb: "Now it gets interesting. Real moves in either direction." },
  { name: "Moon", move: "2% – 5%", fp: 1000, blurb: "Big swings. High upside, and the drawdown to match." },
  { name: "Degen", move: "5% and up", fp: 1600, blurb: "Pure chaos. Can double or collapse within one round." },
];

function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

function CoinCategories() {
  return (
    <View>
      <Paragraph>
        Every coin belongs to one of five categories. They are based on how much a coin actually moves — not on how big
        or how old it is.
      </Paragraph>

      <View style={styles.table}>
        {CATEGORIES.map((c, i) => (
          <View key={c.name} style={[styles.row, i === CATEGORIES.length - 1 ? styles.rowLast : undefined]}>
            <View style={styles.rowTop}>
              <Text style={styles.catName}>{c.name}</Text>
              <Text style={styles.catMeta}>
                ±{c.move} · {c.fp} FP
              </Text>
            </View>
            <Text style={styles.catBlurb}>{c.blurb}</Text>
          </View>
        ))}
      </View>

      <Heading>How it is measured</Heading>
      <Paragraph>
        We look at the coin's price over the last 24 hours and work out its typical 10-minute move — the length of one
        round. Next to each coin in the draft list you see it as ±x.x%.
      </Paragraph>

      <Heading>Why it matters</Heading>
      <Paragraph>
        A coin's category sets its price in fantasy points (FP). You have 4,000 FP to spend on 5 coins, so the wilder
        coins that can score more also cost more — you can't fill a portfolio with Degens (two of them already use up
        3,200 FP).
      </Paragraph>

      <Heading>Can a coin change category?</Heading>
      <Paragraph>
        Yes. Every coin is re-measured about once a day, and it only moves to another category when its movement clearly
        crosses the boundary — so it doesn't flip back and forth. A portfolio keeps the prices it was built with, even
        if a coin changes category later.
      </Paragraph>
      <Paragraph>
        A coin that hasn't been measured yet shows a temporary category, guessed from its size and age, until its first
        measurement comes in.
      </Paragraph>
    </View>
  );
}

export const GUIDE_TOPICS: GuideTopic[] = [
  { id: "coin-categories", title: "Coin categories", icon: "layer-group", body: <CoinCategories /> },
];

const styles = StyleSheet.create({
  paragraph: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  heading: { color: C.textPrimary, fontWeight: "700", fontSize: 13, marginTop: 6, marginBottom: 4 },
  table: {
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: C.bg,
  },
  row: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  rowLast: { borderBottomWidth: 0 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catName: { color: C.textPrimary, fontWeight: "800", fontSize: 14 },
  catMeta: { color: C.accent, fontWeight: "700", fontSize: 12 },
  catBlurb: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
});
