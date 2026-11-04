import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet } from "react-native";
import { OVERLAY_BLUR, useIsDesktop, useOverlayOffset } from "../utils/desktop";
import { PF_COLORS as C } from "../theme";

// A full-screen page that slides up on the phone (the tournament popup, the coin chart). On a desktop window
// a full-screen page would cover the whole browser, so there it is a centred dialog over a dimmed backdrop.
export function PageModal({ visible = true, onRequestClose, children }: { visible?: boolean; onRequestClose: () => void; children: ReactNode }) {
  const desktop = useIsDesktop();
  const offset = useOverlayOffset();
  if (!desktop) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onRequestClose}>
        {children}
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable style={[styles.backdrop, OVERLAY_BLUR, { paddingLeft: 32 + offset }]} onPress={onRequestClose}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 32 },
  dialog: {
    width: "100%",
    maxWidth: 640,
    height: "88%",
    maxHeight: 820,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
    backgroundColor: C.bg,
  },
});
