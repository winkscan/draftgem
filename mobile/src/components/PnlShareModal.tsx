import { useRef, useState } from "react";
import { Modal, Pressable, Share, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { DraftGemLogo } from "./brand/DraftGemLogo";
import { PnlChart } from "./PnlChart";
import { WORKER_URL } from "../pumpfantasy/config";
import { ellipsify } from "../pumpfantasy/format";
import { PNL_PERIOD_LABEL, formatUsd, type PnlPeriod } from "../pumpfantasy/pnlSeries";
import { PublicKey } from "@solana/web3.js";
import { PF_COLORS as C } from "../theme";

// The share dialog: a picture of the profit/loss chart (logo, period, wallet, amount, chart) that can
// be copied as an image, sent with the phone's share sheet (X included), or its link copied.
// The image capture and sharing modules are native: in a build without them the buttons fall back
// to sharing plain text.
export function PnlShareModal({
  visible,
  onClose,
  address,
  period,
  total,
  points,
}: {
  visible: boolean;
  onClose: () => void;
  address: string;
  period: PnlPeriod;
  total: number;
  points: { t: number; v: number }[];
}) {
  const shotRef = useRef<View>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [done, setDone] = useState<"link" | "image" | null>(null);
  const link = WORKER_URL + "/p/" + address;
  const tone = total > 0.005 ? C.positive : total < -0.005 ? C.negative : C.textPrimary;
  const text = "My profit/loss on DraftGem: " + formatUsd(total) + " (" + PNL_PERIOD_LABEL[period] + ")";

  const flash = (what: "link" | "image") => {
    setDone(what);
    setTimeout(() => setDone(null), 1600);
  };

  const copyLink = async () => {
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(link);
      flash("link");
    } catch {
      Share.share({ message: link });
    }
  };

  const copyImage = async () => {
    try {
      const { captureRef } = require("react-native-view-shot");
      const Clipboard = require("expo-clipboard");
      const base64: string = await captureRef(shotRef, { format: "png", quality: 1, result: "base64" });
      await Clipboard.setImageAsync(base64);
      flash("image");
    } catch {
      Share.share({ message: text + "\n" + link });
    }
  };

  const shareImage = async () => {
    try {
      const { captureRef } = require("react-native-view-shot");
      const Sharing = require("expo-sharing");
      const uri: string = await captureRef(shotRef, { format: "png", quality: 1, result: "tmpfile" });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share Profit/Loss" });
    } catch {
      Share.share({ message: text + "\n" + link });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.title}>Share Profit/Loss Chart</Text>
            <TouchableRipple style={styles.close} borderless onPress={onClose}>
              <FontAwesome6 name="xmark" size={18} color={C.textPrimary} />
            </TouchableRipple>
          </View>

          {/* Everything inside this view is what ends up in the picture. */}
          <View ref={shotRef} collapsable={false} style={styles.shot}>
            <View style={styles.shotTop}>
              <DraftGemLogo height={20} />
              <Text style={styles.shotPeriod}>{PNL_PERIOD_LABEL[period]}</Text>
            </View>
            <Text style={styles.shotAddress}>{ellipsify(new PublicKey(address), 4)}</Text>
            <Text style={[styles.shotAmount, { color: tone }]}>{formatUsd(total)}</Text>
            <View style={styles.shotChart} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
              <PnlChart points={points} width={chartWidth} height={110} idPrefix="pnlShare" />
            </View>
          </View>

          <View style={styles.buttons}>
            <View style={styles.buttonRow}>
              <TouchableRipple style={[styles.button, styles.buttonHalf, styles.buttonOutline]} borderless onPress={copyLink}>
                <View style={styles.buttonInner}>
                  <FontAwesome6 name={done === "link" ? "check" : "link"} size={14} color={C.textPrimary} />
                  <Text style={styles.buttonText}>{done === "link" ? "Copied" : "Copy link"}</Text>
                </View>
              </TouchableRipple>
              <TouchableRipple style={[styles.button, styles.buttonHalf, styles.buttonOutline]} borderless onPress={copyImage}>
                <View style={styles.buttonInner}>
                  <FontAwesome6 name={done === "image" ? "check" : "copy"} size={14} color={C.textPrimary} />
                  <Text style={styles.buttonText}>{done === "image" ? "Copied" : "Copy image"}</Text>
                </View>
              </TouchableRipple>
            </View>
            <TouchableRipple style={[styles.button, styles.buttonPrimary]} borderless onPress={shareImage}>
              <View style={styles.buttonInner}>
                <FontAwesome6 name="x-twitter" brand size={15} color={C.accent2TextOn} />
                <Text style={[styles.buttonText, { color: C.accent2TextOn }]}>Share</Text>
              </View>
            </TouchableRipple>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 16 },
  dialog: { width: "100%", maxWidth: 420, backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.cardBorder, padding: 16, gap: 16 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: -6 },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 17, flexShrink: 1 },
  shot: { backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, paddingTop: 14, paddingHorizontal: 14, overflow: "hidden" },
  shotTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shotPeriod: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  shotAddress: { color: C.textSecondary, fontSize: 13, marginTop: 8 },
  shotAmount: { fontWeight: "800", fontSize: 34, marginTop: 2 },
  shotChart: { marginTop: 10, marginHorizontal: -14, height: 110 },
  // Same size and shape as the app's other buttons (52 high, fully round).
  buttons: { gap: 12 },
  buttonRow: { flexDirection: "row", gap: 12 },
  // Two share a row (flex), the Share button spans the width: flex:1 in a column would collapse its height to 0.
  button: { height: 52, borderRadius: 999, justifyContent: "center", alignSelf: "stretch" },
  buttonHalf: { flex: 1 },
  buttonOutline: { borderWidth: 1, borderColor: C.cardBorder },
  buttonPrimary: { backgroundColor: C.accent2 },
  buttonInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  buttonText: { color: C.textPrimary, fontWeight: "800", fontSize: 15 },
});
