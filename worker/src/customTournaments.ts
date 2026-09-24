import { Connection, PublicKey } from "@solana/web3.js";
import type { Env } from "./env";
import type { TournamentStates } from "./tournamentState";
import { HISTORY_WINDOW_SECONDS, TICK_MS, loadAuthority } from "./syncPrices";
import type { Payout } from "./settlement";
import { CURRENCIES, type Currency } from "./currency";

// Tournaments created by players from the app's "+" screen, alongside the ones
// the cron keeps creating on its own.
//
// They live on chain exactly like the cron-made ones — and the on-chain
// authority is still OUR key, because only the authority can register prices,
// finalize and cancel (a tournament owned by a player's wallet could never be
// paid out). What is player-specific — the name, public/private, who made it —
// is not on chain; it lives here in KV and the app reads it from GET
// /tournament-meta. "Private" therefore means unlisted: the app hides those
// tournaments from the lists and the creator shares a link instead. (Chain data
// is public, so it is not secrecy — it is "only the people you send the link to
// will find it".)
//
// Creating costs CREATE_FEE_LAMPORTS, which is what stops anyone from spamming
// tournaments (each one costs us rent + fees). The player pays with ONE
// transaction: a SOL transfer to our authority wallet plus a Memo carrying the
// tournament's parameters. The transaction's signature is the request's proof:
// the worker checks on chain that the transfer and the memo are really there,
// and each payment can create exactly one tournament.

export type Visibility = "public" | "private";

export interface CustomMeta {
  id: string;
  name: string;
  visibility: Visibility;
  /** Prize structure; absent on tournaments made before it existed (= top half). */
  payout?: Payout;
  /** Extra cut of the pool paid to the creator (CREATOR_FEE_BPS); absent on tournaments made before the contract could pay it. */
  creatorFeeBps?: number;
  /** Entry-fee currency; absent on tournaments made before this existed (= SOL). */
  currency?: Currency;
  creator: string;
  startTs: number;
  endTs: number;
}

export interface CreateRequest {
  creator: string;
  name: string;
  visibility: Visibility;
  payout: Payout;
  currency: Currency;
  entryFeeLamports: number;
  entryMode: "single" | "multiple";
  startInSec: number;
  durationSec: number;
  ts: number; // unix seconds when the player built the payment
  signature: string; // signature of the payment transaction (base58)
}

/**
 * What it costs a player to create a tournament — always paid in SOL (the memo+transfer
 * verification below), regardless of what currency the tournament itself will run in.
 * The app reads it from /create-info, so changing it needs no app release.
 */
export const CREATE_FEE_LAMPORTS = 5_000_000; // 0.005 SOL
export const MIN_FEE_LAMPORTS = 1_000_000; // 0.001 SOL (entry fee)
export const MAX_FEE_LAMPORTS = 5_000_000_000; // 5 SOL (entry fee)
// Per-currency entry-fee bounds — same "0.001 to 5 of the unit" shape as SOL's, scaled to
// each mint's own decimals (ORE 11, USDC 6) rather than SOL's 9.
const ENTRY_FEE_RANGE: Record<Currency, { min: number; max: number }> = {
  SOL: { min: MIN_FEE_LAMPORTS, max: MAX_FEE_LAMPORTS },
  ORE: { min: 100_00000000, max: 500_000_00000000 }, // 0.001 – 5,000 ORE
  USDC: { min: 1_000, max: 5_000_000_000 }, // 0.001 – 5,000 USDC
};
// Entry window / round lengths on offer. The longest total (6h entry window + 24h round = 30h) must stay well inside
// tournamentState.ts flag retention (72h), or a long tournament would lose its progress flags.
export const ALLOWED_SECONDS = [600, 1800, 3600, 10800, 21600]; // entry windows
export const ALLOWED_DURATIONS = [3600, 21600, 43200, 86400]; // round lengths: 1h, 6h, 12h, 24h
export const PAYOUTS: Payout[] = ["top1", "top3", "p30", "p50", "pvp"];
/** Mirrors constants::CREATOR_FEE_BPS in the program: the creator's cut, on top of the platform's 5%. */
export const CREATOR_FEE_BPS = 500;
export const NAME_MIN = 3;
export const NAME_MAX = 40;
const PAYMENT_MAX_AGE_SECONDS = 3600;
const MAX_ACTIVE_CUSTOM = 200; // keeps the maintenance pass bounded
const KEEP_META_SECONDS = 30 * 24 * 3600;
const MAX_META = 600;
const INDEX_KEY = "custom-index";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** The exact text put in the payment's Memo. Mirrored in the app (createTournamentMessage). */
export function createMessage(p: Omit<CreateRequest, "signature">): string {
  return [
    "DraftGem: create tournament",
    `name=${p.name}`,
    `visibility=${p.visibility}`,
    `payout=${p.payout}`,
    `currency=${p.currency}`,
    `fee=${p.entryFeeLamports}`,
    `mode=${p.entryMode}`,
    `start=${p.startInSec}`,
    `duration=${p.durationSec}`,
    `ts=${p.ts}`,
    `creator=${p.creator}`,
  ].join("\n");
}

function hasControlChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

/** Returns an error message, or the well-formed request. Does not touch the network. */
export function validateCreateRequest(body: unknown, nowSec: number): { error: string } | { req: CreateRequest } {
  const b = body as Partial<CreateRequest> | null;
  if (!b || typeof b !== "object") return { error: "Body must be a JSON object" };

  if (typeof b.name !== "string" || b.name !== b.name.trim() || hasControlChars(b.name)) {
    return { error: "Invalid name" };
  }
  if (b.name.length < NAME_MIN || b.name.length > NAME_MAX) {
    return { error: `Name must be ${NAME_MIN}-${NAME_MAX} characters` };
  }
  if (b.visibility !== "public" && b.visibility !== "private") return { error: "visibility must be public or private" };
  if (!PAYOUTS.includes(b.payout as Payout)) return { error: "Unsupported prize structure" };
  if (b.currency !== "SOL" && b.currency !== "ORE" && b.currency !== "USDC") return { error: "Unsupported currency" };
  if (b.entryMode !== "single" && b.entryMode !== "multiple") return { error: "entryMode must be single or multiple" };
  if (b.payout === "pvp" && b.entryMode !== "single") return { error: "A PvP duel must be single entry" };
  const feeRange = ENTRY_FEE_RANGE[b.currency as Currency];
  if (!Number.isInteger(b.entryFeeLamports) || (b.entryFeeLamports as number) < feeRange.min || (b.entryFeeLamports as number) > feeRange.max) {
    return { error: `Entry fee out of range for ${b.currency}` };
  }
  if (!ALLOWED_SECONDS.includes(b.startInSec as number)) return { error: "Unsupported entry window" };
  if (!ALLOWED_DURATIONS.includes(b.durationSec as number)) return { error: "Unsupported duration" };
  if (!Number.isInteger(b.ts) || nowSec - (b.ts as number) > PAYMENT_MAX_AGE_SECONDS || (b.ts as number) - nowSec > 300) {
    return { error: "Payment is too old — start again" };
  }
  if (typeof b.creator !== "string" || typeof b.signature !== "string" || b.signature.length < 64 || b.signature.length > 100) {
    return { error: "Missing creator or payment signature" };
  }
  try {
    new PublicKey(b.creator);
  } catch {
    return { error: "Invalid creator address" };
  }
  return { req: b as CreateRequest };
}

export function treasuryAddress(env: Env): string {
  return loadAuthority(env.AUTHORITY_SECRET_KEY).publicKey.toBase58();
}

/** Checks on chain that `req.signature` really paid the creation fee for exactly these parameters. */
async function verifyPayment(env: Env, req: CreateRequest, nowSec: number): Promise<string | null> {
  const connection = new Connection(`https://devnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, "confirmed");
  let tx = null;
  for (let attempt = 0; attempt < 4 && !tx; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500)); // the RPC can lag a moment behind the wallet
    tx = await connection.getParsedTransaction(req.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  }
  if (!tx) return "Payment not found on chain yet — try again in a moment";
  if (tx.meta?.err) return "Payment transaction failed";
  if (!tx.blockTime || nowSec - tx.blockTime > PAYMENT_MAX_AGE_SECONDS) return "Payment is too old — start again";

  const treasury = treasuryAddress(env);
  let paid = false;
  let memoOk = false;
  for (const ix of tx.transaction.message.instructions) {
    if ("parsed" in ix) {
      if (ix.program === "system" && ix.parsed?.type === "transfer") {
        const info = ix.parsed.info;
        if (info.source === req.creator && info.destination === treasury && Number(info.lamports) >= CREATE_FEE_LAMPORTS) {
          paid = true;
        }
      }
      if (ix.programId.toBase58() === MEMO_PROGRAM && ix.parsed === createMessage(req)) memoOk = true;
    }
  }
  if (!paid) return "Payment does not match the creation fee";
  if (!memoOk) return "Payment does not match these tournament settings";
  return null;
}

async function loadIndex(env: Env): Promise<CustomMeta[]> {
  return ((await env.CACHE.get(INDEX_KEY, "json")) as CustomMeta[] | null) ?? [];
}

/** Everything the app needs to label and hide tournaments: id -> {name, visibility, creator}. */
type PublicMeta = Pick<CustomMeta, "name" | "visibility" | "creator"> & { payout: Payout; creatorFeeBps: number; currency: Currency };
export async function getMetaMap(env: Env): Promise<Record<string, PublicMeta>> {
  const out: Record<string, PublicMeta> = {};
  for (const m of await loadIndex(env)) {
    out[m.id] = {
      name: m.name,
      visibility: m.visibility,
      creator: m.creator,
      payout: m.payout ?? "p50",
      creatorFeeBps: m.creatorFeeBps ?? 0,
      currency: m.currency ?? "SOL",
    };
  }
  return out;
}

/**
 * What settlement needs to know per player-made tournament: its prize structure and,
 * when the creator earns the cut, who they are. Tournaments not listed use the default
 * top half and the plain 5% rake.
 */
export interface SettlementInfo {
  payout: Payout;
  /** The creator's wallet, only when the creator earns the extra cut. */
  creator?: string;
}
export async function getSettlementInfo(env: Env): Promise<Record<string, SettlementInfo>> {
  const out: Record<string, SettlementInfo> = {};
  for (const m of await loadIndex(env)) {
    out[m.id] = { payout: m.payout ?? "p50", creator: m.creatorFeeBps ? m.creator : undefined };
  }
  return out;
}

/** What the "+" screen needs before it builds the payment: the (always-SOL) creation fee,
 * plus each entry-fee currency's mint/decimals/bounds so the app never has to hardcode them. */
export async function getCreateInfo(env: Env): Promise<{
  feeLamports: number;
  treasury: string;
  available: boolean;
  currencies: Record<Currency, { mint: string | null; decimals: number; minFee: number; maxFee: number }>;
}> {
  const now = Math.floor(Date.now() / 1000);
  const active = (await loadIndex(env)).filter((m) => m.endTs > now).length;
  const currencies = Object.fromEntries(
    (Object.keys(CURRENCIES) as Currency[]).map((c) => [
      c,
      { mint: CURRENCIES[c].mint?.toBase58() ?? null, decimals: CURRENCIES[c].decimals, minFee: ENTRY_FEE_RANGE[c].min, maxFee: ENTRY_FEE_RANGE[c].max },
    ]),
  ) as Record<Currency, { mint: string | null; decimals: number; minFee: number; maxFee: number }>;
  return { feeLamports: CREATE_FEE_LAMPORTS, treasury: treasuryAddress(env), available: active < MAX_ACTIVE_CUSTOM, currencies };
}

/** Ids of custom tournaments the maintenance pass should look at: started, not yet fully settled, inside the work window. */
export async function activeCustomIds(env: Env, states: TournamentStates): Promise<bigint[]> {
  const now = Math.floor(Date.now() / 1000);
  return (await loadIndex(env))
    .filter((m) => now >= m.startTs && now < m.endTs + HISTORY_WINDOW_SECONDS && !states[m.id]?.settled)
    .map((m) => BigInt(m.id));
}

export interface CreateOnChain {
  (params: {
    id: bigint;
    currency: Currency;
    entryFeeLamports: number;
    startTs: number;
    endTs: number;
    entryModeTag: number;
    guaranteedAmountLamports: number;
  }): Promise<string>;
}

interface CreateResult {
  id: string;
  startTs: number;
  endTs: number;
  url: string;
  deepLink: string;
}

export async function handleCreateCustom(
  env: Env,
  body: unknown,
  origin: string,
  createOnChain: CreateOnChain,
): Promise<{ status: number; body: unknown }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const checked = validateCreateRequest(body, nowSec);
  if ("error" in checked) return { status: 400, body: { error: checked.error } };
  const req = checked.req;

  // One payment, one tournament. A retry with the same payment (e.g. the app lost the
  // response) gets the tournament that was already made instead of a second one.
  const paidKey = `create-paid:${req.signature}`;
  const previous = (await env.CACHE.get(paidKey, "json")) as { done?: CreateResult; pendingSince?: number } | null;
  if (previous?.done) return { status: 200, body: previous.done };
  if (previous?.pendingSince && nowSec - previous.pendingSince < 90) {
    return { status: 409, body: { error: "This tournament is already being created — wait a moment" } };
  }

  const problem = await verifyPayment(env, req, nowSec);
  if (problem) return { status: 402, body: { error: problem } };

  const index = await loadIndex(env);
  if (index.filter((m) => m.endTs > nowSec).length >= MAX_ACTIVE_CUSTOM) {
    return { status: 503, body: { error: "Too many tournaments running right now — retry in a few minutes (your payment is kept)" } };
  }
  await env.CACHE.put(paidKey, JSON.stringify({ pendingSince: nowSec }), { expirationTtl: 3600 });

  // ms timestamp id, nudged off the cron's 5-minute grid so the two id spaces never collide.
  let id = BigInt(Date.now());
  if (id % BigInt(TICK_MS) === 0n) id += 1n;
  const startTs = nowSec + req.startInSec;
  const endTs = startTs + req.durationSec;

  try {
    await createOnChain({
      id,
      currency: req.currency,
      entryFeeLamports: req.entryFeeLamports,
      startTs,
      endTs,
      entryModeTag: req.entryMode === "multiple" ? 1 : 0,
      guaranteedAmountLamports: 0, // nothing funds a house guarantee for player-made tournaments
    });
  } catch (err) {
    await env.CACHE.delete(paidKey); // paid but not created: let the same payment be retried
    return { status: 500, body: { error: err instanceof Error ? err.message : String(err) } };
  }

  const meta: CustomMeta = {
    id: id.toString(),
    name: req.name,
    visibility: req.visibility,
    payout: req.payout,
    creatorFeeBps: CREATOR_FEE_BPS,
    currency: req.currency,
    creator: req.creator,
    startTs,
    endTs,
  };
  const keep = index.filter((m) => m.endTs > nowSec - KEEP_META_SECONDS).slice(-(MAX_META - 1));
  await env.CACHE.put(INDEX_KEY, JSON.stringify([...keep, meta]));

  const result: CreateResult = { id: meta.id, startTs, endTs, url: `${origin}/t/${meta.id}`, deepLink: `pumpfantasy://t/${meta.id}` };
  await env.CACHE.put(paidKey, JSON.stringify({ done: result }), { expirationTtl: 30 * 24 * 3600 });
  return { status: 200, body: result };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The page a shared link opens in a browser: a button that launches the app on this tournament. */
export async function landingPage(env: Env, id: string): Promise<Response> {
  if (!/^\d{1,20}$/.test(id)) return new Response("Not found\n", { status: 404 });
  const meta = (await loadIndex(env)).find((m) => m.id === id);
  const title = meta ? esc(meta.name) : `Tournament #${esc(id)}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · DraftGem</title>
<meta property="og:title" content="${title} · DraftGem"><meta property="og:description" content="You're invited to a DraftGem fantasy crypto tournament.">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center}
.card{max-width:360px;padding:32px 24px;margin:16px;background:#0d0c11;border:1px solid rgba(236,228,253,.12);border-radius:24px}
h1{font-size:22px;margin:0 0 8px}p{color:#ababba;font-size:14px;line-height:1.5;margin:0 0 24px}
a.btn{display:block;background:#14f195;color:#04140d;font-weight:700;text-decoration:none;padding:14px;border-radius:999px}
small{display:block;margin-top:16px;color:#ababba}</style></head><body><div class="card">
<h1>${title}</h1><p>${meta ? (meta.visibility === "private" ? "A private tournament — you were invited." : "A public tournament.") : "A DraftGem tournament."} Pick 5 coins and compete.</p>
<a class="btn" href="pumpfantasy://t/${esc(id)}">Open in DraftGem</a><small>Don't have the app yet? Install DraftGem first, then tap this link again.</small></div></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
