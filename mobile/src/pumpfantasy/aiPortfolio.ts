import { WORKER_URL } from "./config";

// The AI portfolio: the worker asks Claude for 5 coins matching a risk level (worker/src/ai.ts).

export const RISK_LEVELS: { name: string; description: string }[] = [
  { name: "Steady", description: "Calm, well-known coins. Small moves, small swings." },
  { name: "Careful", description: "Mostly calm coins with a little upside." },
  { name: "Balanced", description: "A mix of calm and volatile coins." },
  { name: "Bold", description: "Mostly volatile coins, one calm anchor at most." },
  { name: "Moonshot", description: "The wildest coins. Big wins, big losses." },
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
}

export async function fetchAiPortfolio(risk: number, exclude: string[]): Promise<AiResult> {
  const res = await fetch(WORKER_URL + "/ai-portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ risk, exclude }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<AiResult> & { error?: string };
  if (!res.ok || !body.picks) throw new Error(body.error ?? "The AI could not build a portfolio right now");
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
