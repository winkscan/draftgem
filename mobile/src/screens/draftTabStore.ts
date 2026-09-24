import { useSyncExternalStore } from "react";

// Which tab a Multiple tournament's page shows ("New Entry" / "My Entries"). The tabs live in the
// header panel while the content lives in the screen, so both read this small shared store.
export type DraftTab = "draft" | "mine";

const tabs: Record<string, DraftTab> = {};
const listeners = new Set<() => void>();

// True while a tournament's "Congratulations!" page is showing: the header hides for it.
const successShown: Record<string, boolean> = {};

export function useEntrySuccess(tournamentId: string): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => successShown[tournamentId] ?? false,
  );
  const set = (v: boolean) => {
    successShown[tournamentId] = v;
    listeners.forEach((l) => l());
  };
  return [on, set];
}

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
