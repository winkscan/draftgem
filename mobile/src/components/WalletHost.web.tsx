// Web build: the "Connect wallet" picker. Rendered once in App.tsx; connect() in useMobileWallet.web.tsx opens it.
import { useState, useSyncExternalStore } from "react";
import { Image, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { cancelPick, getState, pickWallet, subscribe } from "../utils/webWalletStore";
import { PF_COLORS as C } from "../theme";
import { OVERLAY_BLUR, useOverlayOffset } from "../utils/desktop";

const INSTALL_LINKS = [
  { name: "Phantom", url: "https://phantom.app/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/downloads" },
];

export function WalletHost() {
  const s = useSyncExternalStore(subscribe, getState, getState);
  const offset = useOverlayOffset();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (name: string) => {
    setBusy(name);
    setError(null);
    try {
      await pickWallet(name);
    } catch (e: any) {
      setError(e?.message ?? "The wallet did not connect");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={s.picking} transparent animationType="fade" onRequestClose={cancelPick}>
      <Pressable style={[styles.backdrop, OVERLAY_BLUR, { paddingLeft: 16 + offset }]} onPress={cancelPick}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Connect a wallet</Text>
          <Text style={styles.hint}>Pick the Solana wallet you want to play with.</Text>
          {s.wallets.length === 0 ? (
            <View>
              <Text style={styles.hint}>No Solana wallet found in this browser. Install one, then reload the page:</Text>
              {INSTALL_LINKS.map((l) => (
                <TouchableRipple key={l.name} style={styles.row} borderless onPress={() => Linking.openURL(l.url)}>
                  <Text style={styles.rowText}>{l.name}</Text>
                </TouchableRipple>
              ))}
            </View>
          ) : (
            s.wallets.map((w) => (
              <TouchableRipple key={w.name} style={styles.row} borderless disabled={!!busy} onPress={() => choose(w.name)}>
                <View style={styles.rowInner}>
                  <Image source={{ uri: w.icon }} style={styles.icon} />
                  <Text style={styles.rowText}>{w.name}</Text>
                  {busy === w.name ? <Text style={styles.busy}>Confirm in the wallet…</Text> : null}
                </View>
              </TouchableRipple>
            ))
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableRipple style={styles.cancel} borderless onPress={cancelPick}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableRipple>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 16 },
  sheet: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 20,
  },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 20 },
  hint: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 12 },
  row: { height: 56, borderRadius: 14, backgroundColor: C.glass, justifyContent: "center", paddingHorizontal: 14, marginTop: 8 },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 28, height: 28, borderRadius: 8 },
  rowText: { color: C.textPrimary, fontWeight: "700", fontSize: 15 },
  busy: { color: C.textSecondary, fontSize: 12, marginLeft: "auto" },
  error: { color: C.error, fontSize: 13, marginTop: 12 },
  cancel: { height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: 14, borderWidth: 1, borderColor: C.cardBorder },
  cancelText: { color: C.textPrimary, fontWeight: "700", fontSize: 14 },
});
