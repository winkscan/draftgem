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

const SPLIT_ROWS = [
  { who: "Winners", value: "90%", note: "Shared by the players who finish in the prize places." },
  { who: "You, the creator", value: "5%", note: "Paid straight to your wallet once the tournament pays out." },
  { who: "Platform", value: "5%", note: "Keeps DraftJam running." },
];

const STRUCTURES = [
  { name: "Top 1", blurb: "Winner takes all — only the best portfolio is paid." },
  { name: "Top 3", blurb: "1st place gets 50% of the prize pool, 2nd gets 30%, 3rd gets 15%." },
  { name: "30%", blurb: "The top 30% of players place, earning less the further down they rank." },
  { name: "50%", blurb: "The top half of players split the prize equally." },
  { name: "PvP", blurb: "A duel: exactly two players, winner takes all." },
];

const ENTRY_MODES = [
  { name: "Single", blurb: "One portfolio per wallet. You can enter this tournament exactly once." },
  { name: "Multiple", blurb: "Build as many portfolios as you like, each paying its own entry fee and scoring on its own — including against your own other entries." },
];

function TournamentTypes() {
  return (
    <View>
      <Paragraph>
        Every tournament has two settings that decide how it plays: its entry mode (who can enter, and how many times)
        and its prize structure (how many places get paid). Both are shown as badges on the tournament's card.
      </Paragraph>

      <Heading>Entry mode: Single vs Multiple</Heading>
      <View style={styles.table}>
        {ENTRY_MODES.map((m, i) => (
          <View key={m.name} style={[styles.row, i === ENTRY_MODES.length - 1 ? styles.rowLast : undefined]}>
            <Text style={styles.catName}>{m.name}</Text>
            <Text style={styles.catBlurb}>{m.blurb}</Text>
          </View>
        ))}
      </View>

      <Heading>Prize structure</Heading>
      <Paragraph>How many of the best portfolios split the pool.</Paragraph>
      <View style={styles.table}>
        {STRUCTURES.map((s, i) => (
          <View key={s.name} style={[styles.row, i === STRUCTURES.length - 1 ? styles.rowLast : undefined]}>
            <Text style={styles.catName}>{s.name}</Text>
            <Text style={styles.catBlurb}>{s.blurb}</Text>
          </View>
        ))}
      </View>
      <Paragraph>
        A tie is settled fairly: portfolios that end up with the exact same score split whatever place(s) they're tied
        for evenly between themselves — never less than the plan holds, but a big tie near the cut-off can leave the
        places below it with nothing.
      </Paragraph>
      <Paragraph>
        Among portfolios tied with each other, the one that entered first is listed higher in the standings — checked
        by each entry's on-chain timestamp. That never changes how much any of them get; tied entries always split
        their combined prize equally.
      </Paragraph>
    </View>
  );
}

function CreateYourOwn() {
  return (
    <View>
      <Paragraph>
        Tap the green + to run your own tournament: pick the rules, name it, and share the link with your friends.
      </Paragraph>

      <Heading>Public or private</Heading>
      <Paragraph>
        A public tournament is listed in the Lobby for everyone. A private one is hidden from the lists — only people you
        send the link to can find and join it. That makes private tournaments the way to play just with your friends.
      </Paragraph>

      <Heading>What you earn</Heading>
      <Paragraph>
        Creating costs a small one-time fee (currently 0.005 SOL). In return you earn 5% of the prize pool of every
        tournament you create, on top of the platform's own 5%. Winners share the remaining 90%.
      </Paragraph>
      <View style={styles.table}>
        {SPLIT_ROWS.map((r, i) => (
          <View key={r.who} style={[styles.row, i === SPLIT_ROWS.length - 1 ? styles.rowLast : undefined]}>
            <View style={styles.rowTop}>
              <Text style={styles.catName}>{r.who}</Text>
              <Text style={styles.catMeta}>{r.value}</Text>
            </View>
            <Text style={styles.catBlurb}>{r.note}</Text>
          </View>
        ))}
      </View>
      <Paragraph>
        The pool is all the entry fees together, so you earn more the more people join. If nobody enters, there is
        nothing to pay out. In the tournaments the app creates itself, winners share 95% and the platform keeps 5%.
      </Paragraph>

      <Heading>Prize structures</Heading>
      <View style={styles.table}>
        {STRUCTURES.map((s, i) => (
          <View key={s.name} style={[styles.row, i === STRUCTURES.length - 1 ? styles.rowLast : undefined]}>
            <Text style={styles.catName}>{s.name}</Text>
            <Text style={styles.catBlurb}>{s.blurb}</Text>
          </View>
        ))}
      </View>
      <Paragraph>
        A tie splits whatever place(s) it's tied for evenly among the players in it. A PvP duel is single-entry and
        closes as soon as two players are in.
      </Paragraph>

      <Heading>Sharing</Heading>
      <Paragraph>
        When the tournament is created you get a link. Tap it to copy, or use Share link to send it. Anyone who opens it
        lands right on your tournament.
      </Paragraph>
    </View>
  );
}

function EntryDeposit() {
  return (
    <View>
      <Paragraph>
        When you enter a tournament you pay the entry fee, plus a small refundable deposit. The deposit is not a fee: it
        is the on-chain storage rent that your entry needs, and it comes back to your wallet after the tournament is over.
      </Paragraph>

      <Heading>What the deposit is</Heading>
      <Paragraph>
        About 0.002 SOL for your entry itself. If you are the first player to pick a coin in this tournament, you also
        cover that coin's price record (about 0.0011 SOL per coin) — coins already picked by someone else cost you
        nothing extra. So the deposit is at most about 0.008 SOL.
      </Paragraph>

      <Heading>When you get it back</Heading>
      <Paragraph>
        Automatically, once the tournament has paid out and been wrapped up — you don't need to do anything. It goes
        straight to the wallet that paid it, whether or not you won. If a tournament is cancelled, you get your entry fee
        and the deposit back too.
      </Paragraph>

      <Heading>Where the results go</Heading>
      <Paragraph>
        Finished tournaments stay in Results with their full standings; only the temporary on-chain records are removed.
      </Paragraph>
    </View>
  );
}

export const GUIDE_TOPICS: GuideTopic[] = [
  { id: "coin-categories", title: "Coin categories", icon: "layer-group", body: <CoinCategories /> },
  { id: "tournament-types", title: "Tournament types", icon: "shuffle", body: <TournamentTypes /> },
  { id: "create-tournament", title: "Create your own tournament", icon: "circle-plus", body: <CreateYourOwn /> },
  { id: "entry-deposit", title: "Entry deposit & refunds", icon: "rotate-left", body: <EntryDeposit /> },
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
  catMeta: { color: C.accentText, fontWeight: "700", fontSize: 12 },
  catBlurb: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
});
