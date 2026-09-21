// One-off first pass: measure every candidate coin's typical 10-minute move so
// the groups are real from day one instead of waiting ~10 hours for the
// Worker's own rolling refresh (a few coins per cron tick, GeckoTerminal's
// free tier is rate limited). Same maths as worker/src/volatility.ts; results
// are merged into the Worker's KV key "volatility" (entries newer than ours
// win). Run from the repo root: node scripts/seedVolatility.js [--limit N]
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const WORKER = "https://pumpfantasy-cron.swapkings.workers.dev";
const PROGRESS = "/tmp/vol-seed.json";
const MIN_CANDLES = 48;
const GAP_MS = 2300; // ~26 calls/min, under GeckoTerminal's 30/min
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

function moveFromCandles(list) {
  const c = list.filter((x) => x[4] > 0).sort((a, b) => a[0] - b[0]);
  if (c.length < MIN_CANDLES) return null;
  let acc = 0, n = 0;
  for (let i = 1; i < c.length; i++) {
    const gap = (c[i][0] - c[i - 1][0]) / 300;
    if (gap <= 0) continue;
    const r = Math.log(c[i][4] / c[i - 1][4]);
    acc += (r * r) / gap;
    n++;
  }
  return n === 0 ? null : Math.sqrt((acc / n) * 2) * 100;
}

async function measure(mint) {
  const pr = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`);
  if (!pr.ok) return null;
  const pairs = await pr.json();
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const best = pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${best.pairAddress}/ohlcv/minute?aggregate=5&limit=288&currency=usd`,
    );
    if (r.status === 429) { await sleep(30_000); continue; }
    if (!r.ok) return null;
    return moveFromCandles((await r.json()).data?.attributes?.ohlcv_list ?? []);
  }
  return "gave-up";
}

(async () => {
  const coins = (await (await fetch(WORKER + "/candidates")).json()).candidates.slice(0, LIMIT);
  const done = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, "utf8")) : {};
  console.log(coins.length, "coins;", Object.keys(done).length, "already measured in", PROGRESS);

  let i = 0, ok = 0;
  for (const c of coins) {
    i++;
    if (done[c.mint]) continue;
    try {
      const v = await measure(c.mint);
      if (v === "gave-up") { console.log("rate-limited too long, stopping — rerun to resume"); break; }
      done[c.mint] = { v, at: Date.now() };
      if (v != null) ok++;
    } catch (e) {
      console.log(c.symbol, "error:", e.message);
    }
    if (i % 25 === 0) {
      fs.writeFileSync(PROGRESS, JSON.stringify(done));
      console.log(`${i}/${coins.length}  measured this run: ${ok}`);
    }
    await sleep(GAP_MS);
  }
  fs.writeFileSync(PROGRESS, JSON.stringify(done));

  // merge into KV (run from worker/ so wrangler finds wrangler.toml)
  const cwd = path.join(__dirname, "..", "worker");
  let existing = {};
  try {
    existing = JSON.parse(
      execFileSync("npx", ["wrangler", "kv", "key", "get", "volatility", "--binding", "CACHE", "--remote"], { cwd, encoding: "utf8" }),
    );
  } catch { /* nothing stored yet */ }
  const merged = { ...done };
  for (const [mint, e] of Object.entries(existing)) if (!merged[mint] || e.at >= merged[mint].at) merged[mint] = e;
  const out = "/tmp/vol-merged.json";
  fs.writeFileSync(out, JSON.stringify(merged));
  execFileSync("npx", ["wrangler", "kv", "key", "put", "volatility", "--binding", "CACHE", "--path", out, "--remote"], { cwd, stdio: "inherit" });
  const vals = Object.values(merged).map((e) => e.v).filter((v) => v != null).sort((a, b) => a - b);
  const q = (p) => vals[Math.floor(vals.length * p)]?.toFixed(2);
  console.log(`DONE: ${vals.length} measured of ${Object.keys(merged).length}. 10-min move percentiles: p10 ${q(0.1)} p25 ${q(0.25)} p50 ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)} max ${vals[vals.length - 1]?.toFixed(2)}`);
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
