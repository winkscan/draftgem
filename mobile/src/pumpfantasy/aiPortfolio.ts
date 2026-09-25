import { WORKER_URL } from "./config";

// The AI portfolio: the worker asks Claude for 5 coins matching a risk level (worker/src/ai.ts).

// `color` is the slider's colour at that stop (green, through purple, to red).
export const RISK_LEVELS: { name: string; description: string; color: string }[] = [
  { name: "Steady", description: "Calm, well-known coins. Small moves, small swings.", color: "#14f195" },
  { name: "Careful", description: "Mostly calm coins with a little upside.", color: "#57a0ca" },
  { name: "Balanced", description: "A mix of calm and volatile coins.", color: "#9945ff" },
  { name: "Bold", description: "Mostly volatile coins, one calm anchor at most.", color: "#c62c88" },
  { name: "Moonshot", description: "The wildest coins. Big wins, big losses.", color: "#f11212" },
];

export interface AiPick {
  mint: string;
  reason: string;
}

export interface AiResult {
  picks: AiPick[];
  summary: string;
  risk: number;
  totalFp: number;
  /** Free generations left today, and the daily allowance. */
  left?: number;
  limit?: number;
  resetAt?: number;
}

/** `paused`: the AI's credits (or the daily limit) are used up; it comes back when they renew. */
export class AiError extends Error {
  constructor(message: string, readonly paused: boolean, readonly limited = false, readonly resetAt: number | null = null, readonly limit = 0) {
    super(message);
  }
}

export async function fetchAiPortfolio(risk: number, exclude: string[], wallet: string | null): Promise<AiResult> {
  const res = await fetch(WORKER_URL + "/ai-portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ risk, exclude, wallet }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<AiResult> & { error?: string; paused?: boolean; limited?: boolean; resetAt?: number };
  if (!res.ok || !body.picks) throw new AiError(body.error ?? "The AI could not build a portfolio right now", !!body.paused, !!body.limited, body.resetAt ?? null, (body as { limit?: number }).limit ?? 0);
  return body as AiResult;
}

// Hand-over between the AI page and the draft page: the coins the player chose to use, per tournament.
const pending = new Map<string, string[]>();
export const setPendingAiPicks = (tournamentId: string, mints: string[]) => void pending.set(tournamentId, mints);
export function takePendingAiPicks(tournamentId: string): string[] | null {
  const mints = pending.get(tournamentId) ?? null;
  pending.delete(tournamentId);
  return mints;
}
