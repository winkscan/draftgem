# DraftGem

**A skill game for people who know crypto, built for Solana Mobile.** Pick 5 Solana coins, stay inside a 4,000 FP budget, and compete for a prize pool. Entry fees are paid in **SKR**, prizes are paid out by an on-chain program, and an **AI** can build your portfolio for you at the risk level you choose.

Built for the [CLOCK IN — Solana Mobile Hackathon](https://solanamobile.radiant.nexus/). **Live on Solana mainnet** — real money, launched deliberately small: entry-fee ceilings per currency, a completed self-audit, and a visible `BETA` mark in the app while it proves itself out. Website: [draftgem.app](https://draftgem.app).

| | |
|---|---|
| Android app | React Native / Expo, Mobile Wallet Adapter |
| On-chain program | Anchor (Rust), mainnet program `4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu` |
| Backend | Cloudflare Worker (cron + HTTP), `https://draftgem-mainnet.swapkings.workers.dev` |
| Main currency | SKR (Solana Mobile's Seeker token), plus SOL, ORE, USDC |

## The problem, and who it is for

Crypto on a phone is mostly two things: passive holding, or leveraged trading that burns beginners. There is almost nothing in between that is *social*, *bounded in risk* and *about knowledge*. Fantasy sports solved this decades ago: you do not bet on one outcome, you assemble a team, a fixed budget forces trade-offs, and the best judgment wins. DraftGem brings that shape to crypto.

- **Who:** crypto-curious mobile users and Solana Mobile owners who follow coins and want to test their judgment against others, without opening a leveraged position and without being able to lose more than a small entry fee.
- **Why a tournament and not a trade:** the downside is capped at the entry fee, a round lasts one hour to one day, and you compete against people, not the market. The budget rule makes "buy the most volatile thing" a losing strategy, so the game rewards reading coins, not recklessness.
- **Why SKR is central:** SKR is the currency of the Seeker ecosystem, so entering, creating and winning all happen in the token that Seeker owners already hold. Entry fees fill an on-chain SKR vault, prizes come out of it, and a tournament creator earns 5% of the pool in SKR.
- **Why mobile-native:** one tap to sign through the phone's own wallet, an hourly cadence that fits a commute, and share links so a friend can join a tournament from a message.

## How a game works

1. **Draft.** Every coin has a price in fantasy points (FP) set by how much it actually moves. Calm coins are cheap (*Hold*, 100 FP), wild ones are expensive (*Degen*, 1,600 FP). You have **4,000 FP** to spend on **5 coins**, so a portfolio of all-in wild coins is impossible and a portfolio of only calm coins rarely wins.
2. **Enter.** Pay the entry fee (for the automatic lobby tournaments: 100 SKR). Entries lock when the round starts.
3. **Play.** A round lasts 1, 6, 12 or 24 hours. The lobby always has a new one-hour tournament opening, and players can create their own (public or private, with a share link) — the creator earns 5% of that tournament's pool when it pays out.
4. **Score.** Each coin's result is its % change from the start price to the end price (never worse than −100% *for that coin* — a portfolio of five total rugs would score −500%). A portfolio's score is the **sum** of its five coins. The program computes scores itself from the recorded prices.
5. **Get paid.** Prizes go by score: top half, Top 1, Top 3, top 30% or a PvP duel. 5% goes to the platform, and in player-made tournaments another 5% to the creator. Ties split their combined prize.

It's a **skill game, not gambling**: every score is a deterministic function of real, attested market prices — never a random number — and there's no pooled jackpot or lottery mechanic, the same skill-vs-luck shape that lets fantasy sports operate as a game of skill in most jurisdictions.

Coin categories are measured, not guessed: each coin's *typical 1-hour move* is estimated from its price changes over 5 min, 1 h, 6 h and 24 h and kept as a running average, so a coin's price in FP follows its real volatility.

## Solana Mobile and SKR

- **Mobile Wallet Adapter** for connecting and signing everything (entry, tournament creation, payment). No keys ever touch the app. On a Seeker, this is the phone's built-in wallet.
- **SKR is the main currency.** Automatic tournaments are played in SKR, SKR is the first choice when creating a tournament, and the app header and profile show your SKR balance. Entry fees, vaults and payouts are real SPL-token transfers handled by the program.
- The app talks to the **real mainnet SKR mint** (`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`). A separate devnet build (`--features` off, `NETWORK=devnet`) exists purely for local development and testing, against its own test mint with the same 6 decimals (`3KQM6MobTX4TZhoLyQgmKmvvexJ7wozY29FFK9rPUZgU`) since the real SKR token doesn't exist on devnet.

## Verify the SKR flow on-chain

Everything below is on Solana **mainnet**, program `4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu` ([Solscan](https://solscan.io/account/4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu)).

**Escrow design.** Every tournament has one account and one vault, both program-derived addresses:

| Account | Seeds | Role |
|---|---|---|
| Tournament | `["tournament", id (u64 LE)]` | rules, times, pool, status |
| Vault | `["vault", tournament]` | owns the pool; for SKR, its associated token account holds the SKR |
| Entry | `["entry", tournament, player, entry index (u16 LE)]` | one portfolio of 5 coins |
| Coin price | `["asset", tournament, mint]` | the coin's start and end price |

The entry fee moves from the player's SKR token account into the vault's token account inside `enter_tournament`, and only the program can move it out (`claim_prize`, `refund_entry`, `withdraw_fees`). Nobody holds the pool in a wallet.

**Real SKR transactions** (mainnet, 1 Oct 2026):

- A tournament created in SKR: [`25dQRcLD…`](https://solscan.io/tx/25dQRcLDzbTxVryWKFCKzQ2DYGps7EkG6tihpBt8EZ8yg1JtovX7swYg1TVaoUMNncaJtjBHDfNkiV9yAFMn1a5q)
- A player entering with SKR, signed through Mobile Wallet Adapter: [`59EjuTbT…`](https://solscan.io/tx/59EjuTbThpqW9WCLqDSfB8TyxnYvaTEKtq5WwtVj9aCHDNB8Wpu9NgD8PpGUvEinSyjUoes63xvNGd7ejdnEadSz) and [`2Er72vNx…`](https://solscan.io/tx/2Er72vNxv8DkrmMcsxUaMKPYQZSfiaPiy9r6fcUrgYx8LVHJQG1HyaAHWmkwcz7QfuENN2e9433UpnjPRDoGBNDc)
- A prize paid out in SKR from the vault to the winner: [`Y9BrZFFM…`](https://solscan.io/tx/Y9BrZFFMMZpT9ardJrrjoqtyeimthbgb1W5VZ72w29HeEnU4dtRCvNzveHQwZR1GNmfLuVSiC4NtikbXY86Fo9R)

The app reads tournament accounts straight from Solana RPC, not from our server (`mobile/src/pumpfantasy/accounts.ts` decodes them), so any tournament can be checked on-chain.

## Mainnet beta

Real money moves through this program today, so it launched with guardrails rather than open limits:

- **Entry-fee ceilings** per currency, enforced both client-side and by the worker: 500 SKR (~$10), 0.05 SOL, 5 ORE, 10 USDC. A tournament — automatic or player-made — can never be priced above these while the beta mark is up.
- **`create_tournament` is gated on-chain** to the platform's own key under the program's `mainnet` cargo feature (`programs/pumpfantasy/src/constants.rs`) — nobody else can mint a tournament and become its own authority, which is who decides prizes.
- **A completed self-audit** (see [Security](#security) below) before any real money moved, plus a regression test added later specifically for the mainnet-only authority check above (it predated the audit by a few hours and had never been exercised by a test until then).
- **Admin-only maintenance endpoints** (`/sync`, `/settle`, `/create`) on the worker, a kill switch for new tournament creation, and a pre-payout audit that holds a payout instead of sending it if the numbers don't add up.

## AI portfolio

On the draft page, the **AI** button opens a page with a risk slider (*Steady → Careful → Balanced → Bold → Moonshot*). Press **Generate** and a language model builds a 5-coin portfolio for that risk level; **Use portfolio** drops it into the draft.

- The worker sends the model a shortlist of the most liquid coins of every category with their FP price, typical move, market cap, liquidity and age (about 11k tokens), and gets back five picks with a one-line reason each and a plan summary.
- Nothing the model says is trusted: the answer is **validated on the server** (five distinct coins from the list, total within the FP budget), retried with feedback if it fails, and repaired to fit the budget if it only overshoots.
- Providers: **Google AI Studio (Gemini)**'s free tier first (a chain of models with per-model timeouts), Anthropic Claude as an alternative. If the free quota runs out, the app shows a *paused until credits renew* screen instead of an error.
- Free generations are limited per wallet (5 a day) with a global daily cap.

**How it works in detail** (`worker/src/ai.ts`):

- **Inputs.** The five volatility categories (Hold, Farm, Pump, Moon, Degen) each contribute their 30 most liquid coins, so the model chooses from up to 150. Each coin is one line: mint, symbol, category, FP price, typical 1-hour move, market cap, liquidity and age. Coins the player was just shown can be excluded.
- **Risk levels.** Each of the five slider positions has its own written brief. *Steady* allows only Hold and Farm coins; *Moonshot* wants the most volatile coins the budget allows and forbids Hold. The brief also states the budget arithmetic (for example, three Degen coins already exceed 4,000 FP).
- **Constraints.** Exactly 5 different coins, total price at most 4,000 FP, every mint taken from the list. The model must answer through a forced JSON schema (Gemini `responseSchema`, or a forced tool call on Claude) and gives each pick a reason of at most 90 characters that names a real property of the coin, plus a one-sentence plan. The system prompt forbids inventing data and presenting price predictions as facts.
- **Scoring logic.** The AI does not score anything. Its portfolio is an ordinary portfolio: it is entered, priced and scored by the same on-chain rules as any hand-made one (sum of the five coins' % change).
- **Safety limits.** The answer is validated on the server and never shown unchecked: wrong count, a mint outside the list, a duplicate or an over-budget total is rejected and retried up to 3 times with the reason fed back; a plain overshoot is repaired by swapping the priciest pick for the priciest coin that fits. Free use is capped at 5 generations per wallet per day (3 without a wallet, 40 per IP) and 700 per day overall, and the model chain tries Gemini models in order with a per-model timeout, so a busy or exhausted model is skipped.
- **Is the AI judged against people?** Not yet. AI portfolios are not tagged on-chain, so we cannot honestly publish "AI versus human players" results today. Because AI picks are normal entries, adding that comparison later is a matter of recording which entries came from the AI button.

## Architecture

```
 Android app (Expo / React Native)
   │  Mobile Wallet Adapter   ── signs & sends transactions
   │  reads accounts directly from Solana RPC
   │  HTTPS
   ▼
 Cloudflare Worker  (worker/)
   • cron every minute: a quick pass retries any missing start price the instant a round begins
     (nothing else runs if none are pending); every 5th minute the full pass creates the next
     hourly SKR tournament, records start/end prices, settles entries, finalizes, pays out, and
     closes accounts to recover rent; once an hour a full scan also catches player-made
     tournaments whose id isn't on the 5-minute grid
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
- On the `mainnet` build, `create_tournament` additionally requires the signer to be the platform's own authority key (see [Mainnet beta](#mainnet-beta)).
- Winners and refunds are paid to `entry.player` only; anyone may crank settlement and payout.
- Accounts are closed after payout and their rent goes back to whoever paid it (players, coin-account payers, the platform).

### Backend (`worker`)

- **Pre-payout audit:** before finalizing, the worker recomputes every score and prize, re-derives every entry address, and checks the pool against the vault. If anything does not add up, the payout is held (`GET /held`) instead of paid.
- **Price sanity:** a start/end price far from the live price is rejected and retried instead of being written on chain.
- **Treasury sweep:** the worker's own hot key never accumulates funds — SPL token balances (SKR, ORE, USDC) are swept out in full, and native SOL above a small working float (kept for fees and account rent) is swept too, both to the platform's own wallet, on an hourly cadence.
- Maintenance URLs (`/sync`, `/settle`, `/create`) require an admin token.

### App (`mobile`)

Lobby, Live and Results lists, a draft page with category tabs and search, coin charts, portfolio cards, live standings with a comparison slot, tournament creation, share links, a profile with a profit/loss chart and a share-as-image dialog, and an in-app guide. Updates are delivered over the air with EAS Update.

## Security

A free self-audit was run before real money moved (Sealevel-attacks checklist over every fund-moving instruction, `cargo audit`, trust-boundary review, worker and app pass). It found and fixed two high-severity issues, both covered by regression tests that fail on the old code:

- the attestation check did not validate the Ed25519 instruction header, so a forged instruction could fake the backend's signature;
- an SPL entry fee could be routed to a token account chosen by the player instead of the vault.

A follow-up pass found the `mainnet`-only `create_tournament` authority check (added right after the audit, so never exercised by a test) and closed the gap with `programs/pumpfantasy/tests/test_mainnet_gating.rs`, which builds against `--features mainnet` specifically.

The design deliberately trusts one authority key for prices and the prize plan (like most fantasy platforms trust their scorer); the off-chain audit, on-chain budgets (prizes can never exceed the distributable pool), the app only listing platform-created tournaments, and the entry-fee ceilings above all limit what a bad answer — or a compromised key — can do. Renouncing the program's own upgrade authority was considered and deliberately deferred: on this design the trust boundary is the authority key's day-to-day power over prices and payouts, not the program's upgradability, so it wouldn't remove the real risk this early.

## Repository layout

```
programs/pumpfantasy   Anchor program + LiteSVM tests
worker/                Cloudflare Worker (cron, API, settlement, AI)
mobile/                Expo app
pitch/                 Hackathon pitch deck wireframe + demo video script
scripts/               smoke and maintenance scripts
```

## Run it

Requirements: Node 22, Rust with the Solana/Anchor toolchain, a Cloudflare account (for the worker), an Android device or emulator.

```bash
# Program: build, then run the default (devnet-shaped) test suite (loads target/deploy/pumpfantasy.so)
anchor build
cargo test -p pumpfantasy

# The mainnet-only tests (test_mainnet_gating.rs) need a separate build and the real platform-authority
# keypair at repo root as mainnet-authority.json (git-ignored) — not required for the rest of the suite.
anchor build -- --features mainnet
cp target/deploy/pumpfantasy.so target/mainnet/pumpfantasy.so
anchor build   # rebuild the default before running the rest of the suite again
cargo test -p pumpfantasy --test test_mainnet_gating

# Worker
cd worker && npm install
npx wrangler secret put AUTHORITY_SECRET_KEY            # keypair JSON of the platform authority
npx wrangler secret put ATTESTATION_SIGNER_SECRET_KEY   # keypair JSON of the attestation signer
npx wrangler secret put HELIUS_API_KEY
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put GEMINI_API_KEY                  # or ANTHROPIC_API_KEY
npx wrangler deploy                                      # devnet; add -c wrangler.mainnet.toml for mainnet

# App
cd mobile && npm install
npx expo start                                          # development
npx eas-cli build --platform android --profile preview  # APK
```

The program tests sign attestations with the keypair in `attestation-signer.json` at the repository root (git-ignored, never committed). Generate your own with `solana-keygen new --outfile attestation-signer.json` and put its public key in `constants.rs` (`ATTESTATION_SIGNER`) and its secret in the worker.

## Status

**Live on Solana mainnet**, in a deliberately bounded beta (see [Mainnet beta](#mainnet-beta)). The program, worker and app all default to mainnet; a devnet build of each remains available for local development and testing (`NETWORK=devnet`, the program's default cargo build with no `mainnet` feature).
