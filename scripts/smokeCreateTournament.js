// End-to-end check of player-made tournaments against the deployed worker and devnet:
// pay the creation fee (transfer + memo) from the local wallet, ask the worker to
// create the tournament, then verify the result on chain and through the worker's
// endpoints, plus the failure cases (replayed payment, mismatched memo, bad input).
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("../worker/node_modules/@solana/web3.js");

const WORKER = process.env.WORKER_URL || "https://pumpfantasy-cron.swapkings.workers.dev";
const PROGRAM = new PublicKey("4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const message = (p) =>
  [
    "DraftJam: create tournament",
    `name=${p.name}`,
    `visibility=${p.visibility}`,
    `payout=${p.payout}`,
    `fee=${p.entryFeeLamports}`,
    `mode=${p.entryMode}`,
    `start=${p.startInSec}`,
    `duration=${p.durationSec}`,
    `ts=${p.ts}`,
    `creator=${p.creator}`,
  ].join("\n");

async function pay(conn, payer, treasury, lamports, memo) {
  const ixs = [
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: treasury, lamports }),
    new TransactionInstruction({
      programId: MEMO,
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(memo, "utf8"),
    }),
  ];
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.sign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

async function post(body) {
  const res = await fetch(`${WORKER}/create-tournament`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function check(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))),
  );
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");

  const info = await (await fetch(`${WORKER}/create-info`)).json();
  console.log("create-info:", info);
  check("create-info has fee 0.005 SOL and a treasury", info.feeLamports === 5_000_000 && !!info.treasury && info.available);
  const treasury = new PublicKey(info.treasury);

  const base = {
    name: "Smoke test " + Date.now().toString().slice(-6),
    visibility: "private",
    payout: "top3",
    entryFeeLamports: 20_000_000,
    entryMode: "multiple",
    startInSec: 600,
    durationSec: 600,
    creator: payer.publicKey.toBase58(),
  };

  // 1) bad input is rejected before anything is paid
  let r = await post({ ...base, name: "x", ts: Math.floor(Date.now() / 1000), signature: "1".repeat(88) });
  check("too-short name -> 400", r.status === 400, JSON.stringify(r.body));

  // 2) a payment that is too small is rejected
  let ts = Math.floor(Date.now() / 1000);
  const cheap = await pay(conn, payer, treasury, 1_000_000, message({ ...base, ts }));
  r = await post({ ...base, ts, signature: cheap });
  check("underpayment -> 402", r.status === 402, JSON.stringify(r.body));

  // 3) a payment whose memo doesn't match the requested settings is rejected
  ts = Math.floor(Date.now() / 1000);
  const wrongMemo = await pay(conn, payer, treasury, info.feeLamports, message({ ...base, name: "Something else", ts }));
  r = await post({ ...base, ts, signature: wrongMemo });
  check("memo mismatch -> 402", r.status === 402, JSON.stringify(r.body));

  // 4) the real thing
  ts = Math.floor(Date.now() / 1000);
  const good = await pay(conn, payer, treasury, info.feeLamports, message({ ...base, ts }));
  r = await post({ ...base, ts, signature: good });
  check("paid request -> 200", r.status === 200 && !!r.body?.id, JSON.stringify(r.body));
  const created = r.body;
  if (!created?.id) return;

  // 5) replaying the same payment returns the same tournament, not a second one
  const again = await post({ ...base, ts, signature: good });
  check("replay -> same tournament", again.status === 200 && again.body?.id === created.id, JSON.stringify(again.body));

  // 6) on chain: the account exists with the requested settings, authority = worker key
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(created.id));
  const pda = PublicKey.findProgramAddressSync([Buffer.from("tournament"), idBuf], PROGRAM)[0];
  const acc = await conn.getAccountInfo(pda, "confirmed");
  check("tournament account exists on chain", !!acc && acc.data.length === 118);
  if (acc) {
    const d = acc.data;
    const authority = new PublicKey(d.subarray(8, 40));
    const fee = d.readBigUInt64LE(48);
    const startTs = Number(d.readBigInt64LE(56));
    const endTs = Number(d.readBigInt64LE(64));
    const mode = d[8 + 32 + 8 + 8 + 8 + 8 + 2 + 4 + 4 + 8 + 1 + 4 + 4 + 8]; // entry_mode after distributed_pool
    check("authority is the treasury", authority.equals(treasury));
    check("entry fee matches", fee === BigInt(base.entryFeeLamports), String(fee));
    check("start/end match", startTs === created.startTs && endTs === created.endTs && endTs - startTs === base.durationSec);
    check("entry mode = multiple", mode === 1, `mode byte ${mode}`);
  }

  // 7) metadata + landing page
  const meta = (await (await fetch(`${WORKER}/tournament-meta`)).json()).meta;
  check("meta lists name + private + payout", meta[created.id]?.name === base.name && meta[created.id]?.visibility === "private" && meta[created.id]?.payout === "top3");
  const page = await fetch(created.url);
  const html = await page.text();
  check("landing page opens the app link", page.status === 200 && html.includes(`pumpfantasy://t/${created.id}`) && html.includes(base.name));

  console.log("\nCreated:", created);
})();
