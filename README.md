# DraftGem

**Daily fantasy crypto, built for Solana Mobile.** Pick 5 Solana coins, stay inside a 4,000 FP budget, and compete for a prize pool. Entry fees are paid in **SKR**, prizes are paid out by an on-chain program, and an **AI** can build your portfolio for you at the risk level you choose.

Built for the [CLOCK IN — Solana Mobile Hackathon](https://solanamobile.radiant.nexus/). Runs on **Solana devnet** (allowed by the organizers).

| | |
|---|---|
| Android app | React Native / Expo, Mobile Wallet Adapter |
| On-chain program | Anchor (Rust), devnet program `4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu` |
| Backend | Cloudflare Worker (cron + HTTP), `https://pumpfantasy-cron.swapkings.workers.dev` |
| Main currency | SKR (Solana Mobile's Seeker token), plus SOL, ORE, USDC |

## How a game works

1. **Draft.** Every coin has a price in fantasy points (FP) set by how much it actually moves. Calm coins are cheap (*Hold*, 100 FP), wild ones are expensive (*Degen*, 1,600 FP). You have **4,000 FP** to spend on **5 coins**, so a portfolio of all-in wild coins is impossible and a portfolio of only calm coins rarely wins.
2. **Enter.** Pay the entry fee (for the automatic lobby tournaments: 100 SKR). Entries lock when the round starts.
3. **Play.** A round lasts 1, 6, 12 or 24 hours. The lobby always has a new one-hour tournament opening, and players can create their own (public or private, with a share link).
4. **Score.** Each coin's result is its % change from the start price to the end price (never worse than −100%). A portfolio's score is the **sum** of its five coins. The program computes scores itself from the recorded prices.
5. **Get paid.** Prizes go by score: top half, Top 1, Top 3, top 30% or a PvP duel. 5% goes to the platform, and in player-made tournaments another 5% to the creator. Ties split their combined prize.

Coin categories are measured, not guessed: each coin's *typical 1-hour move* is estimated from its price changes over 5 min, 1 h, 6 h and 24 h and kept as a running average, so a coin's price in FP follows its real volatility.

## Solana Mobile and SKR

- **Mobile Wallet Adapter** for connecting and signing everything (entry, tournament creation, payment). No keys ever touch the app. On a Seeker, this is the phone's built-in wallet.
- **SKR is the main currency.** Automatic tournaments are played in SKR, SKR is the first choice when creating a tournament, and the app header and profile show your SKR balance. Entry fees, vaults and payouts are real SPL-token transfers handled by the program.
- On devnet the real SKR mint does not exist, so the project owns a test mint with the same 6 decimals (`3KQM6MobTX4TZhoLyQgmKmvvexJ7wozY29FFK9rPUZgU`). The real mainnet mint (`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`) is already wired in and is selected by one constant when the app moves to mainnet.

## AI portfolio

On the draft page, the **AI** button opens a page with a risk slider (*Steady → Careful → Balanced → Bold → Moonshot*). Press **Generate** and a language model builds a 5-coin portfolio for that risk level; **Use portfolio** drops it into the draft.

- The worker sends the model a shortlist of the most liquid coins of every category with their FP price, typical move, market cap, liquidity and age (about 11k tokens), and gets back five picks with a one-line reason each and a plan summary.
- Nothing the model says is trusted: the answer is **validated on the server** (five distinct coins from the list, total within the FP budget), retried with feedback if it fails, and repaired to fit the budget if it only overshoots.
- Providers: Google Gemini's free tier first (a chain of models with per-model timeouts), Anthropic Claude as an alternative. If the free quota runs out, the app shows a *paused until credits renew* screen instead of an error.
- Free generations are limited per wallet (10 a day) with a global daily cap.

## Architecture

```
 Android app (Expo / React Native)
   │  Mobile Wallet Adapter   ── signs & sends transactions
   │  reads accounts directly from Solana RPC
   │  HTTPS
   ▼
 Cloudflare Worker  (worker/)
   • cron every 5 min: creates the hourly SKR tournament, records start/end prices,
     settles entries, finalizes, pays out, closes accounts to recover rent
   • /candidates  coin pool with volatility categories (Jupiter + DexScreener)
   • /attest      signs each pick's FP price (checked on-chain)
   • /ai-portfolio, /create-tournament, /results, /tournament-meta, ...
   ▼
 Anchor program  (programs/pumpfantasy/)
   create → enter → register prices → settle → finalize → set prizes → claim / refund → close
```

### On-chain program (`programs/pumpfantasy`)

Instructions: `create_tournament`, `enter_tournament`, `register_asset_price`, `submit_result`, `settle_entry`, `finalize_tournament`, `set_prize`, `finish_prizes`, `claim_prize`, `cancel_tournament`, `refund_entry`, `withdraw_fees`, `close_entry`, `close_asset_price`, `close_tournament`.

- Native SOL and any SPL mint (SKR, ORE, USDC) per tournament; the pool lives in a PDA vault.
- An entry needs a short-lived **Ed25519 attestation** of the picks' FP prices from the backend; the program checks the attestation's signer, message *and* instruction header, then enforces the budget itself.
- Winners and refunds are paid to `entry.player` only; anyone may crank settlement and payout.
- Accounts are closed after payout and their rent goes back to whoever paid it (players, coin-account payers, the platform).

### Backend (`worker`)

- **Pre-payout audit:** before finalizing, the worker recomputes every score and prize, re-derives every entry address, and checks the pool against the vault. If anything does not add up, the payout is held (`GET /held`) instead of paid.
- **Price sanity:** a start/end price far from the live price is rejected and retried instead of being written on chain.
- Maintenance URLs (`/sync`, `/settle`, `/create`) require an admin token.

### App (`mobile`)

Lobby, Live and Results lists, a draft page with category tabs and search, coin charts, portfolio cards, live standings with a comparison slot, tournament creation, share links, a profile with a profit/loss chart and a share-as-image dialog, and an in-app guide. Updates are delivered over the air with EAS Update.

## Security

A free self-audit was run before submission (Sealevel-attacks checklist over every fund-moving instruction, `cargo audit`, trust-boundary review, worker and app pass). It found and fixed two high-severity issues, both covered by regression tests that fail on the old code:

- the attestation check did not validate the Ed25519 instruction header, so a forged instruction could fake the backend's signature;
- an SPL entry fee could be routed to a token account chosen by the player instead of the vault.

The design deliberately trusts one authority key for prices and the prize plan (like most fantasy platforms trust their scorer); the off-chain audit, on-chain budgets (prizes can never exceed the distributable pool) and the app only listing platform-created tournaments limit what a bad answer can do.

## Repository layout

```
programs/pumpfantasy   Anchor program + LiteSVM tests
worker/                Cloudflare Worker (cron, API, settlement, AI)
mobile/                Expo app
scripts/               devnet smoke and maintenance scripts
```

## Run it

Requirements: Node 22, Rust with the Solana/Anchor toolchain, a Cloudflare account (for the worker), an Android device or emulator.

```bash
# Program: build, then run the tests (they load target/deploy/pumpfantasy.so)
anchor build
cargo test -p pumpfantasy

# Worker
cd worker && npm install
npx wrangler secret put AUTHORITY_SECRET_KEY            # keypair JSON of the platform authority
npx wrangler secret put ATTESTATION_SIGNER_SECRET_KEY   # keypair JSON of the attestation signer
npx wrangler secret put HELIUS_API_KEY
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put GEMINI_API_KEY                  # or ANTHROPIC_API_KEY
npx wrangler deploy

# App
cd mobile && npm install
npx expo start                                          # development
npx eas-cli build --platform android --profile preview  # APK
```

The program tests sign attestations with the keypair in `attestation-signer.json` at the repository root (git-ignored, never committed). Generate your own with `solana-keygen new --outfile attestation-signer.json` and put its public key in `constants.rs` (`ATTESTATION_SIGNER`) and its secret in the worker.

## Status

Devnet. Moving to mainnet means deploying the program, switching the RPC and the SKR mint constant, and removing the test-token faucet route.
