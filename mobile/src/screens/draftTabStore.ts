import { useSyncExternalStore } from "react";

// Which tab a Multiple tournament's page shows ("New Entry" / "My Entries"). The tabs live in the
// header panel while the content lives in the screen, so both read this small shared store.
export type DraftTab = "draft" | "mine";

const tabs: Record<string, DraftTab> = {};
const listeners = new Set<() => void>();

export function useDraftTab(tournamentId: string): [DraftTab, (t: DraftTab) => void] {
  const tab = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => tabs[tournamentId] ?? "draft",
  );
  const set = (t: DraftTab) => {
    tabs[tournamentId] = t;
    listeners.forEach((l) => l());
  };
  return [tab, set];
}
