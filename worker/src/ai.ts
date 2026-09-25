import type { Env } from "./env";
import { getAllCandidates, type DiscoveredAsset } from "./tokenDiscovery";

// "AI portfolio": a language model picks a 5-coin portfolio for a chosen risk level. Two providers,
// whichever key is set (Gemini first: its free tier costs nothing; otherwise Claude).
//
// The model never sees the whole 1000-coin pool: a shortlist of the most liquid coins of each
// volatility category goes into the prompt (mint, category, FP price, typical hourly move, market cap,
// liquidity, age). It answers through a forced tool call, and the answer is CHECKED here before it
// leaves the worker — five distinct coins from the shortlist, total price within the FP budget — so a
// bad or hallucinated answer can never reach a player as a portfolio.

const MODEL = "claude-haiku-4-5-20251001"; // fast and cheap: a portfolio pick doesn't need a bigger model
const BUDGET_FP = 4000;
const PER_TIER = 30; // shortlist size per volatility category
// Free-tier limits measured in AI Studio (2026-09-25), per model: Flash models 5 requests/min and only 20/day;
// Flash-Lite models 15/min and 500/day each, all with 250K tokens/min. So the chain below burns through the 20/day
// of the better models first, and the two Flash-Lite models carry the day: ~1000 requests, ~20 portfolios a minute.
const DAILY_CAP = 700; // portfolios per day across all players (KV counter): stays under the Flash-Lite daily quotas
// Free portfolios per player per day. One portfolio is one model call of about 6k tokens in and 0.4k out
// (see `usage` in the response), so 10 a day per wallet keeps 40 active players inside the global cap.
export const PER_WALLET_DAILY = 10;
const PER_ANONYMOUS_DAILY = 3; // no wallet connected: counted by IP only
const PER_IP_DAILY = 40; // backstop against one machine inventing wallet addresses
const TIERS = ["Hold", "Farm", "Pump", "Moon", "Degen"];

export const RISK_LEVELS = 5;

const RISK_BRIEF = [
  "STEADY (risk 1 of 5): protect capital. Use the calmest coins, Hold and Farm categories only, well-known and liquid. Avoid anything volatile.",
  "CAREFUL (risk 2 of 5): mostly calm coins (Hold, Farm) with at most one or two Pump coins for a little upside.",
  "BALANCED (risk 3 of 5): a deliberate mix of calm and volatile coins, spanning at least three different categories.",
  "BOLD (risk 4 of 5): mostly volatile coins (Pump and Moon), at most one calm anchor. Budget arithmetic: use at most one Degen coin; an example that fits is Moon + Moon + Pump + Pump + Farm.",
  "MOONSHOT (risk 5 of 5): maximum risk and reward, the most volatile coins the budget allows. Budget arithmetic matters: three Degen coins already exceed the budget. Good shapes that fit: Degen + Degen + Pump (or Farm), or Degen + Moon + Moon + Farm, always checking the total is at most the budget. No Hold coins.",
];

export class AiUnavailableError extends Error {}
/** One player used up their free generations for today (the app shows how many they get and when they return). */
export class AiLimitError extends Error {
  constructor(message: string, readonly limit: number) {
    super(message);
  }
}
/** The AI can't answer because its free/paid credits (or our own daily cap) are used up: the app shows "paused". */
export class AiPausedError extends AiUnavailableError {}
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
  /** Free generations this player has left today, and the daily allowance. */
  left?: number;
  limit?: number;
  /** Tokens the model used for this portfolio (for cost planning). */
  usage?: { model: string; input: number; output: number };
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

function priceTable(coins: DiscoveredAsset[]): string {
  const seen = new Map<string, number>();
  for (const c of coins) if (!seen.has(c.tier)) seen.set(c.tier, c.fpCost);
  return TIERS.filter((t) => seen.has(t)).map((t) => t + " " + seen.get(t)).join(", ");
}

function buildUser(risk: number, coins: DiscoveredAsset[], feedback: string | null): string {
  return (
    RISK_BRIEF[risk] +
    "\n\nAvailable coins (mint | symbol | category | FP price | typical 1-hour move | market cap | liquidity | age):\n" +
    coins.map(line).join("\n") +
    "\n\nCategory prices in FP: " +
    priceTable(coins) +
    ". The five prices must add up to at most " +
    BUDGET_FP +
    " FP, so wild picks are limited by the budget (two Degen coins already cost over half of it)." +
    "\nPick 5 different coins, total at most " +
    BUDGET_FP +
    " FP, and submit the portfolio." +
    (feedback ? "\n\nYour previous answer was rejected: " + feedback + " Fix it." : "")
  );
}

const PICKS_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "object", properties: { mint: { type: "string" }, reason: { type: "string" } }, required: ["mint", "reason"] },
    },
    summary: { type: "string" },
  },
  required: ["picks", "summary"],
};

// Best first. Older models (2.5 and earlier) are closed to new keys, and the newest ones are often
// overloaded ("high demand", 503), so a request walks down this list until one answers.
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

/** Google Gemini (free tier via AI Studio): JSON out through a response schema. */
let lastUsage: { model: string; input: number; output: number } | null = null;

async function askGemini(env: Env, user: string): Promise<unknown> {
  const upper = (n: any): any =>
    Array.isArray(n) ? n.map(upper) : n && typeof n === "object" ? Object.fromEntries(Object.entries(n).map(([k, v]) => [k, k === "type" ? String(v).toUpperCase() : upper(v)])) : n;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 1, responseMimeType: "application/json", responseSchema: upper(PICKS_SCHEMA), maxOutputTokens: 4096 },
  });
  let dayQuotaHit = false;
  let minuteQuotaHit = false;
  let last = 0;
  for (const model of [env.GEMINI_MODEL, ...GEMINI_MODELS].filter((m): m is string => !!m)) {
    let res: Response;
    try {
      res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
        body,
        signal: AbortSignal.timeout(15_000), // a model that thinks for minutes is skipped, not waited for
      });
    } catch {
      last = 408;
      continue;
    }
    last = res.status;
    if (res.status === 429) {
      // This model's free quota is spent; another model has its own. A per-day quota means "paused until it
      // renews", a per-minute one only means "busy, try again in a moment".
      if (/PerDay/i.test(await res.text())) dayQuotaHit = true;
      else minuteQuotaHit = true;
      continue;
    }
    if (res.status === 503 || res.status === 404) continue; // overloaded or retired: next one
    if (!res.ok) throw new AiFailedError("AI service answered " + res.status);
    const out = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    lastUsage = { model, input: out.usageMetadata?.promptTokenCount ?? 0, output: (out.usageMetadata?.candidatesTokenCount ?? 0) + (out.usageMetadata?.thoughtsTokenCount ?? 0) };
    const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    try {
      return JSON.parse(text);
    } catch {
      continue; // cut off or not JSON: try another model
    }
  }
  if (dayQuotaHit && !minuteQuotaHit) throw new AiPausedError("The AI's free credits are used up. Generation resumes when they renew.");
  if (minuteQuotaHit) throw new AiFailedError("The AI is busy right now — try again in a minute");
  throw new AiFailedError("The AI is busy right now (" + last + ") — try again in a moment");
}

/** Anthropic Claude: a forced tool call. */
async function askClaude(env: Env, user: string): Promise<unknown> {
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
  if (res.status === 429) throw new AiPausedError("The AI's credits are used up. Generation resumes when they renew.");
  if (res.status === 400 || res.status === 402) {
    const detail = await res.text();
    if (/credit balance|billing/i.test(detail)) throw new AiPausedError("The AI's credits are used up. Generation resumes when they renew.");
    throw new AiFailedError("AI service answered " + res.status);
  }
  if (!res.ok) throw new AiFailedError("AI service answered " + res.status);
  const body = (await res.json()) as { content?: { type: string; input?: unknown }[] };
  const call = body.content?.find((b) => b.type === "tool_use");
  if (!call) throw new AiFailedError("AI gave no portfolio");
  return call.input;
}


async function askOnce(env: Env, risk: number, coins: DiscoveredAsset[], feedback: string | null): Promise<unknown> {
  const user = buildUser(risk, coins, feedback);
  return env.GEMINI_API_KEY ? askGemini(env, user) : askClaude(env, user);
}

/** Returns a problem description, or the checked portfolio. */
function fitToBudget(picks: AiPick[], byMint: Map<string, DiscoveredAsset>): { picks: AiPick[]; total: number } | null {
  const chosen = picks.map((p) => ({ ...p }));
  const all = [...byMint.values()];
  const priceOf = (m: string) => byMint.get(m)!.fpCost;
  let total = chosen.reduce((sum, p) => sum + priceOf(p.mint), 0);
  for (let guard = 0; guard < 5 && total > BUDGET_FP; guard++) {
    // The most expensive pick gives way to the most expensive unused coin that brings the total under the cap.
    chosen.sort((a, b) => priceOf(b.mint) - priceOf(a.mint));
    const worst = chosen[0];
    const room = BUDGET_FP - (total - priceOf(worst.mint));
    const used = new Set(chosen.map((p) => p.mint));
    const swap = all.filter((c) => !used.has(c.mint) && c.fpCost <= room).sort((a, b) => b.fpCost - a.fpCost || (b.volatilityPct ?? 0) - (a.volatilityPct ?? 0))[0];
    if (!swap) return null;
    chosen[0] = { mint: swap.mint, reason: "Swapped in to fit the FP budget: " + swap.tier + " category, " + (swap.volatilityPct != null ? swap.volatilityPct.toFixed(1) + "%/h typical move." : "very active.") };
    total = chosen.reduce((sum, p) => sum + priceOf(p.mint), 0);
  }
  return total <= BUDGET_FP ? { picks: chosen, total } : null;
}

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
  if (total > BUDGET_FP) {
    // Wild portfolios often overshoot (a Degen coin costs 1600 of the 4000 FP): swap the priciest picks
    // for the priciest coin that still fits, instead of failing the whole request.
    const fixed = fitToBudget(picks, byMint);
    if (!fixed) return "the total price was " + total + " FP, over the " + BUDGET_FP + " FP budget.";
    return { picks: fixed.picks, summary: typeof o.summary === "string" ? o.summary.slice(0, 240) : "", risk, totalFp: fixed.total };
  }
  return { picks, summary: typeof o.summary === "string" ? o.summary.slice(0, 240) : "", risk, totalFp: total };
}

async function bump(env: Env, key: string, cap: number): Promise<number | null> {
  const used = Number((await env.CACHE.get(key)) ?? "0");
  if (used >= cap) return null;
  await env.CACHE.put(key, String(used + 1), { expirationTtl: 2 * 24 * 3600 });
  return used + 1;
}

export async function generatePortfolio(env: Env, risk: number, exclude: string[], wallet: string | null, ip: string): Promise<AiPortfolio> {
  if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) throw new AiUnavailableError("AI is not set up yet");
  if (!Number.isInteger(risk) || risk < 0 || risk >= RISK_LEVELS) throw new AiFailedError("risk must be 0-" + (RISK_LEVELS - 1));

  const day = new Date().toISOString().slice(0, 10);
  // Per-player allowance first: it's the one a player can hit, and it must not eat the shared budget.
  const limit = wallet ? PER_WALLET_DAILY : PER_ANONYMOUS_DAILY;
  const who = wallet ? "w:" + wallet : "ip:" + ip;
  const used = await bump(env, "ai-user:" + day + ":" + who, limit);
  if (used == null) {
    throw new AiLimitError("You've used your " + limit + " free AI portfolios for today. They come back at midnight UTC.", limit);
  }
  if ((await bump(env, "ai-ip:" + day + ":" + ip, PER_IP_DAILY)) == null) {
    throw new AiLimitError("Too many AI portfolios from this connection today. Try again tomorrow.", limit);
  }
  if ((await bump(env, "ai-count:" + day, DAILY_CAP)) == null) throw new AiPausedError("Today's AI limit is reached. Generation resumes tomorrow.");

  const coins = shortlist(await getAllCandidates(env), new Set(exclude.filter((m) => typeof m === "string").slice(0, 20)));
  if (coins.length < 20) throw new AiFailedError("Not enough coins to choose from right now");

  let feedback: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    lastUsage = null;
    const checked = check(await askOnce(env, risk, coins, feedback), coins, risk);
    if (typeof checked !== "string") return { ...checked, left: limit - used, limit, usage: lastUsage ?? undefined };
    feedback = checked;
    console.error("AI portfolio rejected (risk " + risk + "): " + checked);
  }
  throw new AiFailedError("The AI's portfolio didn't pass the checks — try again");
}
