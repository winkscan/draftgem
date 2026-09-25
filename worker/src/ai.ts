import type { Env } from "./env";
import { getAllCandidates, type DiscoveredAsset } from "./tokenDiscovery";

// "AI portfolio": Claude picks a 5-coin portfolio for a chosen risk level.
//
// The model never sees the whole 1000-coin pool: a shortlist of the most liquid coins of each
// volatility category goes into the prompt (mint, category, FP price, typical hourly move, market cap,
// liquidity, age). It answers through a forced tool call, and the answer is CHECKED here before it
// leaves the worker — five distinct coins from the shortlist, total price within the FP budget — so a
// bad or hallucinated answer can never reach a player as a portfolio.

const MODEL = "claude-haiku-4-5-20251001"; // fast and cheap: a portfolio pick doesn't need a bigger model
const BUDGET_FP = 4000;
const PER_TIER = 30; // shortlist size per volatility category
const DAILY_CAP = 400; // calls per day across all players (KV counter): keeps the bill bounded
const TIERS = ["Hold", "Farm", "Pump", "Moon", "Degen"];

export const RISK_LEVELS = 5;

const RISK_BRIEF = [
  "STEADY (risk 1 of 5): protect capital. Use the calmest coins, Hold and Farm categories only, well-known and liquid. Avoid anything volatile.",
  "CAREFUL (risk 2 of 5): mostly calm coins (Hold, Farm) with at most one or two Pump coins for a little upside.",
  "BALANCED (risk 3 of 5): a deliberate mix of calm and volatile coins, spanning at least three different categories.",
  "BOLD (risk 4 of 5): mostly volatile coins (Pump and Moon), at most one calm anchor.",
  "MOONSHOT (risk 5 of 5): maximum risk and reward. Spend almost the whole budget on the most volatile coins (Moon, Degen). No calm coins.",
];

export class AiUnavailableError extends Error {}
export class AiFailedError extends Error {}

export interface AiPick {
  mint: string;
  reason: string;
}

export interface AiPortfolio {
  picks: AiPick[];
  summary: string;
  risk: number;
  totalFp: number;
}

function line(c: DiscoveredAsset): string {
  const move = c.volatilityPct != null ? c.volatilityPct.toFixed(2) + "%/h" : "n/a";
  const m = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1e3) + "K");
  return [c.mint, c.symbol, c.tier, c.fpCost + "FP", "move " + move, "mcap $" + m(c.marketCapUsd), "liq $" + m(c.liquidityUsd), "age " + Math.round(c.ageDays) + "d"].join(" | ");
}

/** The most liquid coins of every category (minus any the player just saw), the pool the model chooses from. */
function shortlist(all: DiscoveredAsset[], exclude: Set<string>): DiscoveredAsset[] {
  const out: DiscoveredAsset[] = [];
  for (const tier of TIERS) {
    const inTier = all
      .filter((c) => c.tier === tier && !exclude.has(c.mint))
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
      .slice(0, PER_TIER);
    out.push(...inTier);
  }
  return out;
}

const SYSTEM = `You build fantasy portfolios for DraftGem, a daily fantasy game on Solana coins.
A player picks exactly 5 different coins. Each coin has a price in fantasy points (FP) set by its volatility category (Hold cheapest, then Farm, Pump, Moon, Degen most expensive) and the 5 prices must total at most ${BUDGET_FP} FP. The portfolio's score is the SUM of the five coins' percentage price changes over the round (one hour to one day), and a coin can lose at most 100%. Volatile coins move more in both directions: calm portfolios rarely score much either way, wild ones can score big or lose big.
You choose ONLY from the coins listed, using their exact mint address. Match the requested risk level. Give each pick a short reason (max 90 characters) that names the actual property of the coin (category, typical move, liquidity, size, age), and a one-sentence summary of the portfolio's plan. Never invent data and never mention price predictions as facts.`;

async function askOnce(env: Env, risk: number, coins: DiscoveredAsset[], feedback: string | null): Promise<unknown> {
  const user =
    RISK_BRIEF[risk] +
    "\n\nAvailable coins (mint | symbol | category | FP price | typical 1-hour move | market cap | liquidity | age):\n" +
    coins.map(line).join("\n") +
    "\n\nPick 5 different coins, total at most " +
    BUDGET_FP +
    " FP, and call submit_portfolio." +
    (feedback ? "\n\nYour previous answer was rejected: " + feedback + " Fix it." : "");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      temperature: 1,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      tools: [
        {
          name: "submit_portfolio",
          description: "Submit the chosen 5-coin portfolio.",
          input_schema: {
            type: "object",
            properties: {
              picks: {
                type: "array",
                minItems: 5,
                maxItems: 5,
                items: {
                  type: "object",
                  properties: { mint: { type: "string" }, reason: { type: "string" } },
                  required: ["mint", "reason"],
                },
              },
              summary: { type: "string" },
            },
            required: ["picks", "summary"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_portfolio" },
    }),
  });
  if (!res.ok) throw new AiFailedError("AI service answered " + res.status);
  const body = (await res.json()) as { content?: { type: string; input?: unknown }[] };
  const call = body.content?.find((b) => b.type === "tool_use");
  if (!call) throw new AiFailedError("AI gave no portfolio");
  return call.input;
}

/** Returns a problem description, or the checked portfolio. */
function check(input: unknown, coins: DiscoveredAsset[], risk: number): string | AiPortfolio {
  const byMint = new Map(coins.map((c) => [c.mint, c]));
  const o = input as { picks?: { mint?: unknown; reason?: unknown }[]; summary?: unknown } | null;
  if (!o || !Array.isArray(o.picks) || o.picks.length !== 5) return "it must contain exactly 5 picks.";
  const seen = new Set<string>();
  let total = 0;
  const picks: AiPick[] = [];
  for (const p of o.picks) {
    if (typeof p?.mint !== "string" || !byMint.has(p.mint)) return "a mint was not in the list.";
    if (seen.has(p.mint)) return "a coin was picked twice.";
    seen.add(p.mint);
    total += byMint.get(p.mint)!.fpCost;
    picks.push({ mint: p.mint, reason: typeof p.reason === "string" ? p.reason.slice(0, 140) : "" });
  }
  if (total > BUDGET_FP) return "the total price was " + total + " FP, over the " + BUDGET_FP + " FP budget.";
  return { picks, summary: typeof o.summary === "string" ? o.summary.slice(0, 240) : "", risk, totalFp: total };
}

export async function generatePortfolio(env: Env, risk: number, exclude: string[]): Promise<AiPortfolio> {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError("AI is not set up yet");
  if (!Number.isInteger(risk) || risk < 0 || risk >= RISK_LEVELS) throw new AiFailedError("risk must be 0-" + (RISK_LEVELS - 1));

  const day = new Date().toISOString().slice(0, 10);
  const key = "ai-count:" + day;
  const used = Number((await env.CACHE.get(key)) ?? "0");
  if (used >= DAILY_CAP) throw new AiUnavailableError("The AI has reached today's limit — try again tomorrow");
  await env.CACHE.put(key, String(used + 1), { expirationTtl: 2 * 24 * 3600 });

  const coins = shortlist(await getAllCandidates(env), new Set(exclude.filter((m) => typeof m === "string").slice(0, 20)));
  if (coins.length < 20) throw new AiFailedError("Not enough coins to choose from right now");

  let feedback: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const checked = check(await askOnce(env, risk, coins, feedback), coins, risk);
    if (typeof checked !== "string") return checked;
    feedback = checked;
  }
  throw new AiFailedError("The AI's portfolio didn't pass the checks — try again");
}
