import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAllCandidates } from "./tokenDiscovery";
import { signAttestation, UnknownMintError, BudgetExceededError } from "./attestation";
import { loadUnderlyingMarketCaps } from "./bridgedAssets";
import { findCandidates, syncPrices, GECKO_CALLS_PER_TICK, TICK_MS, ROUND_SECONDS } from "./syncPrices";
import { refreshVolatility } from "./volatility";
import type { PriceBudget } from "./priceHistory";
import { settleTournaments } from "./settlement";
import { getResult, listResults } from "./archive";
import { activeCustomIds, getCreateInfo, getMetaMap, handleCreateCustom, landingPage } from "./customTournaments";
import { loadStates, saveStates } from "./tournamentState";
import type { Env } from "./env";

// Standalone Cron Trigger that creates a fresh PumpFantasy tournament on a
// schedule — the real "tournaments are created automatically" mechanism,
// not dependent on any Claude Code session being open. Ported from
// ~/projects/pumpfantasy/scripts/createTestTournament.js, but built without
// @coral-xyz/anchor (same reasoning as the mobile app's actions.ts/accounts.ts
// — see mobile/src/pumpfantasy/binary.ts's comment — plus Workers' V8
// isolate is yet another runtime where an untested Anchor-JS codepath isn't
// worth the risk when raw @solana/web3.js + hand-rolled Borsh does the job).
//
// Assets are no longer pre-registered here. Under the lazy-registration
// design a player can pick ANY mint from the full `/candidates` pool, not
// just ones an admin batch-registered up front — register_asset_price gets
// called lazily once a tournament's start_ts/end_ts has actually passed and
// real entries reference real mints, not at creation time (see the pending
// follow-up noted in project memory for wiring that scan up).

const PROGRAM_ID = new PublicKey("4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu");
// Public devnet blocks Cloudflare's own IP ranges (403 "Your IP or provider
// is blocked") — confirmed live. Helius devnet doesn't.

const ENTRY_FEE_LAMPORTS = 10_000_000; // 0.01 SOL
const ROUND_DURATION_SECONDS = ROUND_SECONDS;
const ENTRY_WINDOW_SECONDS = ROUND_SECONDS; // syncPrices.ts derives tournament ids from this — change both together

// idl/pumpfantasy.json → instructions[].find(i => i.name === "...").discriminator
const CREATE_TOURNAMENT_DISCRIMINATOR = Uint8Array.from([158, 137, 233, 231, 73, 132, 191, 68]);

const TOURNAMENT_SEED = new TextEncoder().encode("tournament");
const VAULT_SEED = new TextEncoder().encode("vault");

function u64le(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
function i64le(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(n), true);
  return b;
}
function concatBytes(...parts: Uint8Array[]): Buffer {
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

function tournamentPda(id: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([TOURNAMENT_SEED, u64le(id)], PROGRAM_ID);
}
function vaultPda(tournament: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, tournament.toBuffer()], PROGRAM_ID);
}

function loadAuthority(secret: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret.trim())));
}

function loadAttestationSecretKey(secret: string): Uint8Array {
  return Uint8Array.from(JSON.parse(secret.trim()));
}

// `connection.confirmTransaction` defaults to a websocket signature
// subscription (not reliable inside a Workers isolate) with an HTTP
// polling fallback that can run for tens of seconds — a bounded
// getSignatureStatuses loop is cheaper and enough for a cron job.
async function waitForConfirmation(connection: Connection, sig: string): Promise<void> {
  // Every poll is a billed Helius call (this runs every tick) — 2s spacing
  // usually needs a single check instead of the 2-3 a 1.2s spacing did.
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { value } = await connection.getSignatureStatuses([sig]);
    const status = value[0];
    if (status?.err) throw new Error(`Transaction ${sig} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
  }
  throw new Error(`Transaction ${sig} did not confirm within the wait budget`);
}

// `id` is a millisecond timestamp. Cron ticks pass their own scheduled time
// (aligned to TICK_MS), so syncPrices can recompute every recent tournament's
// address from the clock instead of listing them (see syncPrices.ts); manual
// triggers pass Date.now() and are found only by `/sync?full=1`. start/end
// derive from the id, not "now", so the two stay in lockstep.
async function createTournament(env: Env, id: bigint, cycleSeed: bigint): Promise<string> {
  const startTs = Number(id / 1000n) + ENTRY_WINDOW_SECONDS;
  const endTs = startTs + ROUND_DURATION_SECONDS;

  // Rotate entry mode / guaranteed amount for variety, same as the manual
  // test script — a real product decision on which types to actually run
  // is still open (see project memory), this just keeps all badge states
  // exercised automatically. Seeded per call (cron: the tick number; manual:
  // the ms id) so repeated manual triggers within the same minute still get
  // different modes.
  const cycle = Number(cycleSeed % 3n);
  return createTournamentOnChain(env, {
    id,
    entryFeeLamports: ENTRY_FEE_LAMPORTS,
    startTs,
    endTs,
    entryModeTag: cycle === 1 ? 1 : 0, // 0 = Single, 1 = Multiple
    guaranteedAmountLamports: cycle === 2 ? 500_000_000 : 0,
  });
}

interface TournamentParams {
  id: bigint;
  entryFeeLamports: number;
  startTs: number;
  endTs: number;
  entryModeTag: number;
  guaranteedAmountLamports: number;
}

// The on-chain create_tournament call itself, signed by the worker's authority
// key. Shared by the cron and by user-created tournaments (customTournaments.ts):
// the authority must be OUR key either way, because only it can register prices,
// finalize and cancel — a tournament owned by a player's wallet could never be paid out.
async function createTournamentOnChain(env: Env, p: TournamentParams): Promise<string> {
  const { id, entryFeeLamports, startTs, endTs, entryModeTag, guaranteedAmountLamports } = p;
  const authority = loadAuthority(env.AUTHORITY_SECRET_KEY);
  const connection = new Connection(`https://devnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, "confirmed");

  const [tournament] = tournamentPda(id);
  const [vault] = vaultPda(tournament);

  const createIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concatBytes(
      CREATE_TOURNAMENT_DISCRIMINATOR,
      u64le(id),
      u64le(entryFeeLamports),
      i64le(startTs),
      i64le(endTs),
      Uint8Array.from([entryModeTag]),
      u64le(guaranteedAmountLamports),
    ),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: authority.publicKey, blockhash, lastValidBlockHeight }).add(createIx);
  tx.sign(authority);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await waitForConfirmation(connection, sig);

  return `${id} (${sig})`;
}

// One pass over the recent tournaments: record start/end prices from history,
// then (same tick, same candidate list, sequential because settlement needs the
// end prices just written) settle, finalize and pay out. Progress flags live in
// KV so finished work is never re-read from the chain.
async function runMaintenance(env: Env, opts: { full?: boolean }): Promise<string> {
  const connection = new Connection(`https://devnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, "confirmed");
  const loaded = await loadStates(env);
  const lines: string[] = [];
  const budget: PriceBudget = { geckoCalls: GECKO_CALLS_PER_TICK };
  try {
    const extraIds = await activeCustomIds(env, loaded.states);
    const candidates = await findCandidates(connection, loaded.states, { ...opts, extraIds });
    try {
      lines.push(`Prices: ${await syncPrices(env, connection, candidates, loaded.states, budget)}`);
    } catch (err) {
      lines.push(`Prices failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      lines.push(`Settlement: ${await settleTournaments(env, connection, candidates, loaded.states)}`);
    } catch (err) {
      lines.push(`Settlement failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Last, and only with what tournament prices left over: re-measure a few coins' volatility.
    try {
      const coins = (await getAllCandidates(env)).map((c) => c.mint);
      lines.push(`Volatility: ${await refreshVolatility(env, coins, budget)}`);
    } catch (err) {
      lines.push(`Volatility failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } finally {
    try {
      await saveStates(env, loaded);
    } catch (err) {
      console.error("Saving tournament state failed:", err); // e.g. KV daily write limit — don't lose the rest of the pass
    }
  }
  return lines.join("\n");
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const tick = BigInt(Math.floor(event.scheduledTime / TICK_MS));
    ctx.waitUntil(
      createTournament(env, tick * BigInt(TICK_MS), tick)
        .then((result) => console.log(`Created tournament ${result}`))
        .catch((err) => console.error("Tournament creation failed:", err)),
    );
    ctx.waitUntil(loadUnderlyingMarketCaps(env).catch((err) => console.error("Market-cap refresh failed:", err)));
    ctx.waitUntil(
      runMaintenance(env, {})
        .then((result) => console.log(result))
        .catch((err) => console.error("Maintenance failed:", err)),
    );
  },

  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // GET /candidates — the full filtered coin pool the mobile Draft screen
    // browses/searches (All/Degen/Gambler/Contender/Veteran/BlueChip tabs).
    if (req.method === "GET" && url.pathname === "/candidates") {
      try {
        const candidates = await getAllCandidates(env);
        return json({ candidates });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // POST /attest {"mints": [5 base58 strings]} — server-computed real
    // fp_cost per mint, signed so enter_tournament can verify it on-chain
    // without needing every mint pre-registered as its own account.
    if (req.method === "POST" && url.pathname === "/attest") {
      try {
        const body = (await req.json()) as { mints?: unknown };
        if (!Array.isArray(body.mints) || body.mints.length !== 5 || !body.mints.every((m) => typeof m === "string")) {
          return json({ error: "Body must be { mints: [5 base58 strings] }" }, 400);
        }
        const attestationSecretKey = loadAttestationSecretKey(env.ATTESTATION_SIGNER_SECRET_KEY);
        const attestation = await signAttestation(body.mints as string[], attestationSecretKey, env);
        return json(attestation);
      } catch (err) {
        if (err instanceof UnknownMintError || err instanceof BudgetExceededError) {
          return json({ error: err.message }, 400);
        }
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // Manual run of the same maintenance pass the cron does (`curl <worker-url>/sync`);
    // `?full=1` scans every tournament (repair path for non-tick-aligned ones).
    if (req.method === "GET" && (url.pathname === "/sync" || url.pathname === "/settle")) {
      try {
        const result = await runMaintenance(env, { full: url.searchParams.get("full") === "1" });
        return new Response(`${result}
`, { status: 200, headers: corsHeaders() });
      } catch (err) {
        return new Response(`Failed: ${err instanceof Error ? err.message : String(err)}
`, {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    // POST /create-tournament — a player's tournament from the app's "+" screen
    // (see customTournaments.ts). Paid for by the player on chain, created on chain by our key.
    if (req.method === "POST" && url.pathname === "/create-tournament") {
      try {
        const result = await handleCreateCustom(env, await req.json().catch(() => null), url.origin, (p) =>
          createTournamentOnChain(env, p),
        );
        return json(result.body, result.status);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /create-info — the creation fee and where to pay it, for the "+" screen.
    if (req.method === "GET" && url.pathname === "/create-info") {
      try {
        return json(await getCreateInfo(env));
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /tournament-meta — names + public/private for player-made tournaments.
    if (req.method === "GET" && url.pathname === "/tournament-meta") {
      try {
        return json({ meta: await getMetaMap(env) });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /results — finished tournaments (their accounts are closed on chain to get the rent
    // back, so the standings live here); GET /results/<id> — one tournament's full standings.
    if (req.method === "GET" && url.pathname === "/results") {
      try {
        return json({ results: await listResults(env) });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }
    const resultMatch = url.pathname.match(/^\/results\/(\d+)$/);
    if (req.method === "GET" && resultMatch) {
      try {
        const result = await getResult(env, resultMatch[1]);
        return result ? json(result) : json({ error: "Not found" }, 404);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /t/<id> — the shareable link: opens the app on that tournament.
    const shared = url.pathname.match(/^\/t\/(\d+)$/);
    if (req.method === "GET" && shared) return landingPage(env, shared[1]);

    // Manual trigger for testing (`curl <worker-url>/create`). Its own path,
    // not a catch-all: this URL is public, and any stray request (crawler,
    // favicon fetch) that used to land here created a tournament and spent
    // Helius credits + SOL.
    if (req.method === "GET" && url.pathname === "/create") {
      try {
        const id = BigInt(Date.now());
        const result = await createTournament(env, id, id);
        return new Response(`Created tournament ${result}\n`, { status: 200, headers: corsHeaders() });
      } catch (err) {
        return new Response(`Failed: ${err instanceof Error ? err.message : String(err)}\n`, {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    return new Response("Not found\n", { status: 404, headers: corsHeaders() });
  },
};
