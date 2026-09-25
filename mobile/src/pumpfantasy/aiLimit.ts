import { useEffect, useState, useSyncExternalStore } from "react";
import { WORKER_URL } from "./config";

// How many free AI portfolios the player has left today. Shared between the AI page and its header.
export interface AiAllowance {
  left: number;
  limit: number;
  /** When the allowance renews (epoch ms). */
  resetAt: number;
}

let allowance: AiAllowance | null = null;
const listeners = new Set<() => void>();

export function setAiAllowance(a: AiAllowance | null) {
  allowance = a;
  listeners.forEach((l) => l());
}

export function useAiAllowance(): AiAllowance | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => allowance,
  );
}

export async function refreshAiAllowance(wallet: string | null): Promise<void> {
  try {
    const res = await fetch(WORKER_URL + "/ai-limit" + (wallet ? "?wallet=" + wallet : ""));
    if (res.ok) setAiAllowance((await res.json()) as AiAllowance);
  } catch {
    // the counter is a nicety: the generate call reports the limit itself
  }
}

/** "HH:MM:SS" until `resetAt`, ticking every second (00:00:00 once it has passed). */
export function useCountdown(resetAt: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (resetAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resetAt]);
  const secs = resetAt == null ? 0 : Math.max(0, Math.ceil((resetAt - now) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return p(Math.floor(secs / 3600)) + ":" + p(Math.floor((secs % 3600) / 60)) + ":" + p(secs % 60);
}
