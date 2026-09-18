import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAllCandidates } from "./tokenDiscovery";
import { signAttestation, UnknownMintError } from "./attestation";
import { syncPrices } from "./syncPrices";
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
const ROUND_DURATION_SECONDS = 10 * 60;
const ENTRY_WINDOW_SECONDS = 10 * 60; // keep ≤ the cron's own interval's complement — see wrangler.toml

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
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, 1200));
    const { value } = await connection.getSignatureStatuses([sig]);
    const status = value[0];
    if (status?.err) throw new Error(`Transaction ${sig} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
  }
  throw new Error(`Transaction ${sig} did not confirm within the wait budget`);
}

async function createTournament(env: Env): Promise<string> {
  const authority = loadAuthority(env.AUTHORITY_SECRET_KEY);
  const connection = new Connection(`https://devnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, "confirmed");

  const id = BigInt(Date.now());
  const now = Math.floor(Date.now() / 1000);
  const startTs = now + ENTRY_WINDOW_SECONDS;
  const endTs = startTs + ROUND_DURATION_SECONDS;

  // Rotate entry mode / guaranteed amount for variety, same as the manual
  // test script — a real product decision on which types to actually run
  // is still open (see project memory), this just keeps all badge states
  // exercised automatically. Keyed off the millisecond id itself (not the
  // current minute) so repeated manual/testing triggers within the same
  // minute still get different modes, not the same one every time.
  const cycle = Number(id % 3n);
  const entryModeTag = cycle === 1 ? 1 : 0; // 0 = Single, 1 = Multiple
  const guaranteedAmountLamports = cycle === 2 ? 500_000_000 : 0;

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
      u64le(ENTRY_FEE_LAMPORTS),
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
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      createTournament(env)
        .then((result) => console.log(`Created tournament ${result}`))
        .catch((err) => console.error("Tournament creation failed:", err)),
    );
    ctx.waitUntil(
      syncPrices(env)
        .then((result) => console.log(`Synced prices: ${result}`))
        .catch((err) => console.error("Price sync failed:", err)),
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
        const candidates = await getAllCandidates();
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
        const attestation = await signAttestation(body.mints as string[], attestationSecretKey);
        return json(attestation);
      } catch (err) {
        if (err instanceof UnknownMintError) return json({ error: err.message }, 400);
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // Manual trigger for testing (`curl <worker-url>/sync`) — not the real
    // schedule, just lets us verify without waiting for the next cron tick.
    if (req.method === "GET" && url.pathname === "/sync") {
      try {
        const result = await syncPrices(env);
        return new Response(`${result}\n`, { status: 200, headers: corsHeaders() });
      } catch (err) {
        return new Response(`Failed: ${err instanceof Error ? err.message : String(err)}\n`, {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    // Manual trigger for testing (`curl <worker-url>`) — not the real
    // schedule, just lets us verify without waiting for the next cron tick.
    try {
      const result = await createTournament(env);
      return new Response(`Created tournament ${result}\n`, { status: 200, headers: corsHeaders() });
    } catch (err) {
      return new Response(`Failed: ${err instanceof Error ? err.message : String(err)}\n`, {
        status: 500,
        headers: corsHeaders(),
      });
    }
  },
};
