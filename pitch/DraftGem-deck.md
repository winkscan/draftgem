# DraftGem — pitch deck (text version)

Plain-text copy of [`DraftGem.pdf`](DraftGem.pdf), slide by slide, for readers and tools that cannot parse the PDF.

**Links:** [Repository](https://github.com/winkscan/draftgem) · [Android APK](https://github.com/winkscan/draftgem/releases/download/v1.0.0-beta/DraftGem.apk) · [draftgem.app](https://draftgem.app) · Program `4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu` (Solana mainnet)

## 1. DraftGem

**A skill game for people who know crypto.**
Daily fantasy, built for Solana Mobile.
Draft 5 coins. Beat the field. Get paid on-chain.
CLOCK IN — Solana Mobile Hackathon · Solana mainnet

## 2. Crypto knowledge has no scoreboard

Millions of people follow the market, study tokens, spot trends — but there's no fun, low-stakes way to prove it against other people.

Real trading means real exposure: you need capital, and a wrong call costs you the position.

Fantasy sports solved this for sports fans 20 years ago: a fixed entry, a scored roster, a prize pool. Crypto never got its version — especially not one built for a phone, with a crypto-native wallet from the start.

## 3. DraftGem: Daily fantasy for crypto

Pick 5 Solana coins within a fixed budget. Enter a tournament. Watch the standings move live. Get paid automatically when it ends — straight to your wallet.

Your score is just the sum of your five coins' real price moves. No dice, no house edge on the outcome — only what the market actually did.

Built mobile-first for Solana Mobile, signed end-to-end with Mobile Wallet Adapter.

## 4. Skill decides the outcome. Not chance.

Every score is a deterministic function of real market prices, computed on-chain from attested, verifiable data — never a random number.

Winning takes research and judgement: reading volatility, balancing a fixed budget across five picks, picking the right tournament format. That's the same skill-vs-luck test that lets fantasy sports operate as a game of skill in most jurisdictions — DraftGem applies that exact model to crypto.

No pooled jackpot, no lottery mechanic. A fixed entry fee, a transparent prize structure shown before you play, and a program that pays out exactly what it promised.

## 5. Five picks. One budget. Real trade-offs.

Every coin costs Fantasy Points (FP), priced by how much it actually moves — calm coins are cheap, wild ones are expensive.

Hold 100 FP · Farm 300 FP · Pump 650 FP · Moon 1,000 FP · Degen 1,600 FP

You get 4,000 FP for 5 coins — so an all-Degen roster is mathematically impossible, and an all-safe roster rarely wins.

## 6. Join the lobby. Or run your own.

A new tournament opens all the time — 1, 6, 12 or 24-hour rounds.

Public or private: create your own and share a link to play only with friends.

Pick a prize structure before you enter: Top 1 winner-take-all, Top 3, top 30%, top 50%, or a 1-v-1 PvP duel.

## 7. Scored on-chain. Paid on-chain.

Each coin's result is its real % change from start to end, floored at −100% per coin so one rug can't sink you worse than one full slot.

Your score is the sum of your five coins.

The Solana program computes every score itself from recorded prices and sends prizes straight to winners' wallets — no manual payouts, nothing to claim from a person.

## 8. No time to think? Let the AI draft it.

One tap opens a risk slider — Steady → Careful → Balanced → Bold → Moonshot — and an AI model builds a 5-coin portfolio for that risk level, with a one-line reason for every pick.

Built on Google AI Studio / Gemini's free tier, with a fallback model chain so it keeps working even under rate limits.

Nothing the model says is trusted blindly: every answer is validated on the server — five distinct real coins, total cost inside the 4,000 FP budget — before it ever reaches you.

## 9. Built around SKR, Solana Mobile's own token

SKR is the default currency: the automatic hourly tournaments run in SKR, it's the first choice when you create your own, and your SKR balance sits right in the header.

Entry fees, prize pools and payouts are real SPL-token transfers, handled entirely by the on-chain program — the app never touches your keys.

A beta-safe fee ceiling (500 SKR, about $10) keeps early rounds low-stakes while the game is proven out.

## 10. ORE brings a mining-native token into the draft

ORE is a full second currency, not a bolt-on: create a tournament priced in ORE, enter with it, and get paid out in it, exactly like SKR.

Because ORE has its own volatility profile, it widens what a "Degen" pick can look like across the game — more variety in how a portfolio can be built.

Same beta-safety approach as every currency: a fee ceiling (5 ORE) while the game is young.

## 11. Run a tournament. Earn every time it pays out.

Anyone can create a tournament from the app: pick the entry fee, the prize structure, the round length, public or private.

The creator automatically earns 5% of the prize pool, sent by the program the moment the round pays out — no manual collection.

Creation itself costs a small fixed fee (0.005 SOL) — cheap enough to run a tournament for a Discord, a group chat, or just a few friends.

## 12. Native to the Seeker, not bolted on

Every action — connecting, entering, creating, claiming — is signed with Mobile Wallet Adapter. Your keys never touch the app.

On a Seeker, that means the phone's own built-in wallet handles every signature, with the same native prompt every other Solana Mobile app uses.

The whole draft-to-payout loop was designed to work one-handed, in short sessions, between everything else you're doing on your phone.

## 13. Three pieces, one loop

**Mobile app** — React Native / Expo, Mobile Wallet Adapter for every signature.

**Cloudflare Worker backend** — runs the cron that prices coins, settles rounds and pays out; proxies RPC calls; talks to Google AI Studio for the AI portfolios.

**Anchor program on Solana mainnet** — owns every dollar: creates tournaments, records prices, scores entries, and sends prizes. The app and backend can suggest, but only the program moves funds.

Formats supported today: 4 currencies (SKR / SOL / ORE / USDC), 4 round lengths, 5 prize structures, public or private, single or multi-entry.

## 14. Real money, deliberately bounded

DraftGem runs on Solana mainnet today, not a demo network.

A self-audit pass covers every fund-moving instruction, with regression tests for the bugs it found and fixed before launch.

Beta-stage entry-fee ceilings across every currency keep early rounds low-stakes on purpose, while the game proves itself out with real players.

## 15. Show what you know about crypto

DraftGem: draft five coins, beat the field, get paid on-chain.
Built for Solana Mobile · Live on Solana mainnet · CLOCK IN Hackathon submission
draftgem.app
