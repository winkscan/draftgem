import { useState } from "react";
import { ScrollView, Share, StyleSheet, TextInput, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useConnection } from "../utils/ConnectionProvider";
import { formatSol } from "../pumpfantasy/format";
import {
  MAX_ENTRY_FEE_SOL,
  MIN_ENTRY_FEE_SOL,
  NAME_MAX,
  NAME_MIN,
  PAYOUT_CHOICES,
  DURATION_OPTIONS,
  TIME_OPTIONS,
  fetchCreateInfo,
  payCreationFee,
  submitCreate,
  useCreateInfo,
  type CreateParams,
  type CreatedTournament,
  type EntryModeChoice,
  type PayoutChoice,
  type Visibility,
} from "../pumpfantasy/customTournaments";
import { formatAmount, parseAmount, type Currency } from "../pumpfantasy/currency";
import { BottomBar } from "../components/BottomBar";
import { CurrencyIcon } from "../components/CurrencyIcon";
import { PulseBadge } from "../components/PulseBadge";
import type { RootStackParamList } from "../navigators/AppNavigator";
import { PF_COLORS as C } from "../theme";

const CURRENCY_PRESETS: Record<Currency, string[]> = {
  SKR: ["50", "100", "500", "1000", "5000"],
  SOL: ["0.01", "0.05", "0.1", "0.5", "1"],
  ORE: ["5", "10", "25", "50", "100"],
  USDC: ["1", "5", "10", "25", "50"],
};

function hasControlChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

type Step = "idle" | "wallet" | "creating";

const timeLabel = (seconds: number) => [...TIME_OPTIONS, ...DURATION_OPTIONS].find((o) => o.seconds === seconds)?.label ?? `${seconds}s`;

// The "+" screen: set up your own tournament — Public (listed in the Lobby) or
// Private (only reachable through the link you share). Creating costs a small
// fee, paid in one wallet approval; then the tournament exists and you get a link.
export function CreateTournamentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { connection } = useConnection();
  const { selectedAccount } = useAuthorization();
  const { connect, signAndSendTransaction } = useMobileWallet();
  const { data: info } = useCreateInfo();

  const [visibility, setVisibility] = useState<Visibility>("public");
  const [payout, setPayout] = useState<PayoutChoice>("p50");
  const [currency, setCurrency] = useState<Currency>("SKR");
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [feeText, setFeeText] = useState("100");
  const [mode, setMode] = useState<EntryModeChoice>("single");
  const [startInSec, setStartInSec] = useState(1800);
  const [durationSec, setDurationSec] = useState(3600);

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  // Set when something fails BEFORE the fee was paid (e.g. the wallet approval is cancelled): shows the failure screen.
  const [failed, setFailed] = useState<{ cancelled: boolean; message: string } | null>(null);
  // Once the fee is paid we remember it, so a failed creation can be retried without paying twice.
  const [paid, setPaid] = useState<{ signature: string; ts: number; params: CreateParams } | null>(null);
  const [created, setCreated] = useState<{ result: CreatedTournament; name: string; visibility: Visibility } | null>(null);

  const currencyInfo = info?.currencies[currency];
  const decimals = currencyInfo?.decimals ?? 9;
  const feeAmount = Number(feeText.replace(",", "."));
  const entryFeeBaseUnits = parseAmount(feeText, decimals);
  const feeValid =
    Number.isFinite(feeAmount) &&
    entryFeeBaseUnits > 0 &&
    (currencyInfo ? entryFeeBaseUnits >= currencyInfo.minFee && entryFeeBaseUnits <= currencyInfo.maxFee : feeAmount >= MIN_ENTRY_FEE_SOL && feeAmount <= MAX_ENTRY_FEE_SOL);
  const feeRangeLabel = currencyInfo
    ? `${formatAmount(BigInt(currencyInfo.minFee), decimals)}–${formatAmount(BigInt(currencyInfo.maxFee), decimals)} ${currency}`
    : `${MIN_ENTRY_FEE_SOL}–${MAX_ENTRY_FEE_SOL} SOL`;
  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX && !hasControlChars(trimmedName);
  const busy = step !== "idle";
  // Grey until the form is complete (a fee already paid only needs finishing), then green.
  const ready = !!paid || (nameValid && feeValid);

  const onCreate = async () => {
    setError(null);
    if (!paid) {
      if (!nameValid) return setError(`Name must be ${NAME_MIN}–${NAME_MAX} characters.`);
      if (!feeValid) return setError(`Entry fee must be between ${feeRangeLabel}.`);
    }
    setStep("wallet");
    let paymentDone = !!paid;
    try {
      let creator = selectedAccount?.publicKey ?? null;
      if (!creator) creator = (await connect()).publicKey;

      let payment = paid;
      if (!payment) {
        const latest = info ?? (await fetchCreateInfo());
        if (!latest.available) throw new Error("Too many tournaments are running right now — try again in a few minutes.");
        const params: CreateParams = {
          name: trimmedName,
          visibility,
          payout,
          currency,
          entryFeeLamports: entryFeeBaseUnits,
          entryMode: mode,
          startInSec,
          durationSec,
        };
        const ts = Math.floor(Date.now() / 1000);
        const signature = await payCreationFee(connection, creator, signAndSendTransaction, latest, params, ts);
        payment = { signature, ts, params };
        paymentDone = true;
        setPaid(payment);
      }

      setStep("creating");
      const result = await submitCreate(creator, payment.params, payment.ts, payment.signature);
      setCreated({ result, name: payment.params.name, visibility: payment.params.visibility });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["tournament-meta"] });
    } catch (e: any) {
      const message: string = e?.message ?? "Something went wrong.";
      if (paymentDone) {
        // The fee is already paid: stay on the form, where the button finishes the creation.
        setError(message);
      } else {
        setFailed({ cancelled: /declin|cancel|reject|denied/i.test(message), message });
      }
    } finally {
      setStep("idle");
    }
  };

  // Copies the link with expo-clipboard; if that native module isn't in this build, falls back to the share sheet.
  const copyLink = async (url: string) => {
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Share.share({ message: url });
    }
  };

  if (failed) {
    return (
      <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <PulseBadge style={[styles.doneBadge, styles.failBadge]}>
          <FontAwesome6 name="xmark" size={28} color={C.textPrimary} />
        </PulseBadge>
        <Text style={styles.doneTitle}>Couldn't create the tournament</Text>
        <Text style={styles.hint}>
          {failed.cancelled
            ? "You cancelled the payment in your wallet, so nothing was charged and no tournament was created."
            : failed.message}
        </Text>
      </ScrollView>
      <BottomBar>
        <TouchableRipple style={styles.whiteButton} borderless onPress={() => setFailed(null)}>
          <Text style={styles.whiteButtonText}>Back to tournament</Text>
        </TouchableRipple>
      </BottomBar>
      </View>
    );
  }

  if (created) {
    const { result } = created;
    return (
      <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <PulseBadge style={styles.doneBadge}>
          <FontAwesome6 name="check" size={26} color={C.accent2TextOn} />
        </PulseBadge>
        <Text style={styles.doneTitle}>Tournament created</Text>
        <Text style={styles.doneName}>{created.name}</Text>
        <Text style={styles.hint}>
          {created.visibility === "private"
            ? "It's private: it won't appear in the Lobby. Only people with this link can find it."
            : "It's public: it's listed in the Lobby, and you can also share this link."}{" "}
          You'll receive 5% of the prize pool when it pays out.
        </Text>

        <TouchableRipple style={styles.linkBox} borderless onPress={() => copyLink(result.url)}>
          <View style={styles.linkInner}>
            <FontAwesome6 name="link" size={13} color={C.accentText} />
            <Text style={styles.linkText} numberOfLines={2}>
              {result.url}
            </Text>
            <FontAwesome6 name={copied ? "check" : "copy"} size={15} color={copied ? C.accent2 : C.textSecondary} />
          </View>
        </TouchableRipple>
        <Text style={styles.copyHint}>{copied ? "Link copied" : "Tap the link to copy it"}</Text>

      </ScrollView>
      <BottomBar>
        <TouchableRipple
          style={[styles.primary, styles.createButton]}
          borderless
          onPress={() => Share.share({ message: `Join my DraftGem tournament "${created.name}"\n${result.url}` })}
        >
          <View style={styles.primaryInner}>
            <FontAwesome6 name="share-nodes" size={15} color={C.accent2TextOn} />
            <Text style={styles.primaryText}>Share link</Text>
          </View>
        </TouchableRipple>
        <TouchableRipple
          style={styles.whiteButton}
          borderless
          onPress={() => navigation.replace("Draft", { tournamentId: result.id })}
        >
          <Text style={styles.whiteButtonText}>Open tournament</Text>
        </TouchableRipple>
      </BottomBar>
      </View>
    );
  }

  const endsAt = new Date(Date.now() + (startInSec + durationSec) * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const createFee = info ? `${formatSol(info.feeLamports, 3)} SOL` : "a small fee";

  return (
    <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Who can join</Text>
      <View style={styles.cardRow}>
        <OptionCard
          selected={visibility === "public"}
          icon="globe"
          title="Public"
          subtitle="Listed in the Lobby for everyone"
          onPress={() => setVisibility("public")}
        />
        <OptionCard
          selected={visibility === "private"}
          icon="lock"
          title="Private"
          subtitle="Only people with your link"
          onPress={() => setVisibility("private")}
        />
      </View>

      <Text style={styles.label}>Prize structure</Text>
      <View style={styles.chips}>
        {PAYOUT_CHOICES.map((p) => (
          <Chip
            key={p.key}
            label={p.label}
            selected={payout === p.key}
            onPress={() => {
              setPayout(p.key);
              if (p.key === "pvp") setMode("single"); // a duel is one entry per player
            }}
          />
        ))}
      </View>
      <Text style={styles.chipHint}>{PAYOUT_CHOICES.find((p) => p.key === payout)?.description}</Text>

      <Text style={styles.label}>Tournament name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Friday degens"
        placeholderTextColor={C.textSecondary}
        maxLength={NAME_MAX}
        autoCapitalize="sentences"
      />
      <Text style={styles.counter}>
        {trimmedName.length}/{NAME_MAX}
      </Text>

      <Text style={styles.label}>Currency</Text>
      <View style={styles.chips}>
        {(["SKR", "SOL", "ORE", "USDC"] as Currency[]).map((c) => (
          <Chip
            key={c}
            label={c}
            icon={<CurrencyIcon currency={c} size={18} />}
            selected={currency === c}
            onPress={() => {
              setCurrency(c);
              setFeeText(CURRENCY_PRESETS[c][0]);
            }}
          />
        ))}
      </View>

      <Text style={styles.label}>Entry fee ({currency})</Text>
      <TextInput
        style={styles.input}
        value={feeText}
        onChangeText={(t) => setFeeText(t.replace(/[^0-9.,]/g, ""))}
        keyboardType="decimal-pad"
        placeholder={CURRENCY_PRESETS[currency][0]}
        placeholderTextColor={C.textSecondary}
      />
      <View style={styles.chips}>
        {CURRENCY_PRESETS[currency].map((v) => (
          <Chip key={v} label={v} selected={feeText === v} onPress={() => setFeeText(v)} />
        ))}
      </View>

      <Text style={styles.label}>Entries per player</Text>
      <View style={styles.cardRow}>
        <OptionCard
          selected={mode === "single"}
          icon="user"
          title="Single"
          subtitle="One portfolio each"
          onPress={() => setMode("single")}
        />
        <OptionCard
          selected={mode === "multiple"}
          icon="user-group"
          title="Multiple"
          subtitle={payout === "pvp" ? "Not for duels" : "As many as they like"}
          disabled={payout === "pvp"}
          onPress={() => setMode("multiple")}
        />
      </View>

      <Text style={styles.label}>Entries open for</Text>
      <View style={styles.chips}>
        {TIME_OPTIONS.map((o) => (
          <Chip key={o.seconds} label={o.label} selected={startInSec === o.seconds} onPress={() => setStartInSec(o.seconds)} />
        ))}
      </View>

      <Text style={styles.label}>Round length</Text>
      <View style={styles.chips}>
        {DURATION_OPTIONS.map((o) => (
          <Chip key={o.seconds} label={o.label} selected={durationSec === o.seconds} onPress={() => setDurationSec(o.seconds)} />
        ))}
      </View>

      <View style={styles.summary}>
        <SummaryRow icon="hourglass-start" text={`Entries close ${timeLabel(startInSec)} after you create it`} />
        <SummaryRow icon="flag-checkered" text={`The round lasts ${timeLabel(durationSec)} and ends around ${endsAt}`} />
        <SummaryRow
          icon="trophy"
          text={`${PAYOUT_CHOICES.find((p) => p.key === payout)?.description.replace(/\.$/, "")} — 90% of the pool`}
        />
        <SummaryRow
          icon="sack-dollar"
          text="You earn 5% of the prize pool, paid to your wallet when the tournament pays out. The platform takes 5%."
        />
        <SummaryRow icon="coins" text={`Creating a tournament costs ${createFee}`} last />
      </View>

      {paid && !busy ? (
        <Text style={styles.paidNote}>Your creation fee is paid. Tap below to finish — you won't be charged again.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

    </ScrollView>

    <View style={styles.footer}>
      <TouchableRipple
        style={[styles.primary, styles.createButton, !ready ? styles.createDisabled : undefined, busy ? styles.disabled : undefined]}
        borderless
        disabled={busy || !ready}
        onPress={onCreate}
      >
        <View style={styles.primaryInner}>
          {busy ? (
            <ActivityIndicator size={16} color={C.accent2TextOn} />
          ) : (
            <FontAwesome6 name="plus" size={15} color={ready ? C.accent2TextOn : C.textSecondary} />
          )}
          <Text style={[styles.primaryText, !ready ? styles.createTextDisabled : undefined]}>
            {step === "wallet"
              ? "Approve in your wallet…"
              : step === "creating"
                ? "Creating tournament…"
                : paid
                  ? "Finish creating"
                  : selectedAccount
                    ? `Create · ${createFee}`
                    : "Connect wallet & create"}
          </Text>
        </View>
      </TouchableRipple>
    </View>
    </View>
  );
}

function OptionCard({
  selected,
  icon,
  title,
  subtitle,
  onPress,
  disabled,
}: {
  selected: boolean;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableRipple
      style={[styles.option, selected ? styles.optionSelected : undefined, disabled ? styles.chipDisabled : undefined]}
      borderless
      disabled={disabled}
      onPress={onPress}
    >
      <View>
        <FontAwesome6 name={icon} size={16} color={selected ? C.accentText : C.textSecondary} />
        <Text style={[styles.optionTitle, selected ? styles.optionTitleSelected : undefined]}>{title}</Text>
        <Text style={styles.optionSub}>{subtitle}</Text>
      </View>
    </TouchableRipple>
  );
}

function Chip({
  label,
  icon,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableRipple
      style={[styles.chip, selected ? styles.chipSelected : undefined, disabled ? styles.chipDisabled : undefined]}
      borderless
      disabled={disabled}
      onPress={onPress}
    >
      <View style={styles.chipInner}>
        {icon}
        <Text style={[styles.chipText, selected ? styles.chipTextSelected : undefined]}>{label}</Text>
      </View>
    </TouchableRipple>
  );
}

function SummaryRow({ icon, text, last }: { icon: string; text: string; last?: boolean }) {
  return (
    <View style={[styles.summaryRow, last ? { marginBottom: 0 } : undefined]}>
      <FontAwesome6 name={icon} size={12} color={C.textSecondary} style={styles.summaryIcon} />
      <Text style={styles.summaryText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  // Pinned to the bottom, same as the draft page's Enter footer.
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.cardBorder, backgroundColor: C.card },
  createButton: { marginTop: 0 },
  createDisabled: { backgroundColor: C.glassStrong },
  createTextDisabled: { color: C.textSecondary },
  content: { padding: 16, paddingBottom: 32 },
  label: { color: C.textPrimary, fontWeight: "700", fontSize: 14, marginTop: 20, marginBottom: 10 },
  cardRow: { flexDirection: "row", gap: 12 },
  option: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
  },
  optionSelected: { borderColor: C.accent, backgroundColor: C.accentTint },
  optionTitle: { color: C.textPrimary, fontWeight: "700", fontSize: 15, marginTop: 10 },
  optionTitleSelected: { color: C.textPrimary },
  optionSub: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
  input: {
    backgroundColor: C.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    color: C.textPrimary,
    fontSize: 15,
    paddingHorizontal: 18,
    height: 48,
  },
  counter: { color: C.textSecondary, fontSize: 11, textAlign: "right", marginTop: 6, marginRight: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  chipInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  chipSelected: { backgroundColor: C.accent, borderColor: C.accent },
  chipDisabled: { opacity: 0.4 },
  chipHint: { color: C.textSecondary, fontSize: 12, marginTop: 10, marginLeft: 4 },
  chipText: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },
  chipTextSelected: { color: C.accentTextOn, fontWeight: "800" },
  summary: {
    marginTop: 24,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
  },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  summaryIcon: { width: 16, marginTop: 3, textAlign: "center" },
  summaryText: { color: C.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 },
  paidNote: { color: C.accent2, fontSize: 12, marginTop: 16, textAlign: "center" },
  error: { color: C.error, fontSize: 13, marginTop: 16, textAlign: "center" },
  primary: { marginTop: 20, height: 52, borderRadius: 999, backgroundColor: C.accent2, justifyContent: "center" },
  primaryInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primaryText: { color: C.accent2TextOn, fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.6 },
  secondary: {
    marginTop: 12,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryText: { color: C.textPrimary, fontWeight: "700", fontSize: 15 },
  failBadge: { backgroundColor: C.error },
  whiteButton: { height: 52, borderRadius: 999, backgroundColor: C.textPrimary, justifyContent: "center", alignItems: "center" },
  whiteButtonText: { color: "#000000", fontWeight: "800", fontSize: 15 },
  doneBadge: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.accent2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  doneTitle: { color: C.textPrimary, fontWeight: "800", fontSize: 22, textAlign: "center", marginTop: 16 },
  doneName: { color: C.accentText, fontWeight: "700", fontSize: 16, textAlign: "center", marginTop: 6 },
  hint: { color: C.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12 },
  linkBox: {
    marginTop: 24,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  linkInner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  copyHint: { color: C.textSecondary, fontSize: 11, textAlign: "center", marginTop: 8 },
  linkText: { color: C.textPrimary, fontSize: 13, flex: 1 },
});
