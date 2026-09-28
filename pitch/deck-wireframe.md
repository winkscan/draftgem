# DraftGem — pitch deck wireframe

For the CLOCK IN Solana Mobile Hackathon submission. 15 slides, A4 landscape, page split into two
equal halves: **text on the left, illustration on the right**. Page background is solid black
(`#000000`) — so every illustration prompt below is written for a black canvas, matching the app.

Each slide entry below has: a **headline**, **body copy** (what goes on the left half), and an
**image prompt** (what goes on the right half, feed straight into an image generator). Every
illustration renders at a fixed **644 × 727 px**.

---

## Visual style — prepend to every image prompt

Same visual language as the app's own in-app guide illustrations (`assets/onboarding/*.webp`) —
**not a smartphone**, a floating tilted **UI card**.

> **Output size: 644 × 727 px.** A polished 3D render on a **pure solid black background
> (#000000), no scenery, no background gradient**. Centerpiece: a single flat rounded-rectangle
> **UI card** — the DraftGem app's own screen content rendered as a solid glassy/metallic slab
> with a thin colored rim-light along its edge (violet-to-teal), floating and tilted at a
> confident 3/4 angle in the black void, as if lying on an invisible plane receding away from the
> viewer. **This is a floating screen panel, not a phone or device** — no bezel margin around the
> content, no camera cutout, no side buttons, no device body wider than the screen itself. On its
> face: dark card panels (`#0d0c11`) with a thin hairline lavender border, bold white sans-serif
> UI text and numbers, rounded pill badges, a violet-purple glow (`#9945ff`) on primary
> buttons/accents, a mint-green glow (`#14f195`) on gains/prizes/confirmations, red (`#f11212`)
> only on losses. Real, legible short UI copy and numbers on the card face (not gibberish).
> Around the card, 2–4 small **floating 3D decorative props** relevant to the scene — pick from:
> the DraftGem gem-mark logo (a black octagon holding a white "G", ringed by faceted gradient
> shards) with a couple of sparkle particles; a glowing padlock; round avatar-bubble icons
> connected to the card by thin glowing cable-like lines; a paper-airplane icon; a small trophy;
> round coin discs with a bold letter/symbol on them; a chain-link "copy" icon; an "AI" wand-and-
> stars pill badge — each prop lit with its own soft neon glow (violet, teal, or mint), matching
> the reference onboarding art's playful-but-premium mix of UI realism and floating iconography.
> Soft volumetric light bloom, cinematic three-quarter product-shot angle, shallow depth of field
> with the card in sharp focus. No people, no unrelated brand logos, no cartoon-flat/sticker look
> for the card itself (the small floating props may be a little more playful/rounded, same as the
> reference art). High detail, 4K.
>
> **Card geometry — get this right, it's the most common failure:** one single rectangular card,
> straight parallel edges, uniform corner radius on all four corners, perfectly flat face (no
> warped, bent, melted or curved-glass distortion anywhere on it). One consistent perspective for
> the whole card and everything printed on its face together — the UI grid must sit flush and flat
> on the card and recede with the *same* vanishing point as the card's own edges, never tilted or
> stretched independently of it. A natural, moderate tilt only (roughly like a card resting on a
> table and viewed from slightly above/beside it) — avoid wide-angle/fisheye distortion, avoid an
> exaggerated tilt that bends the rectangle, avoid the top and bottom edges coming out different
> lengths. Exactly one card, fully in frame, not cropped by the image edge, no duplicated or
> extra copies of the same card, no warped or mismatched UI elements repeating on it.

Each prompt below is just the **scene on the card + which floating props to use** — prepend the
paragraph above to it.

---

## 01 · Cover

**Headline:** DraftGem
**Sub-headline:** A skill game for people who know crypto.
**Body:**
- Daily fantasy, built for Solana Mobile.
- Draft 5 coins. Beat the field. Get paid on-chain.
- CLOCK IN — Solana Mobile Hackathon · Solana mainnet

**Image prompt (scene):** The card shows the DraftGem Lobby: a top bar with "DraftGem", a wallet
pill reading "195", and below it a tournament card fragment — a badge reading "50%", the title
"100 SKR · Saturday pump", and a row of stats "Players · Duration · Starts in". Floating props: the
gem-mark logo, large, up in the top-left corner with a few sparkle particles, echoing the app's
own mark — this is the hero shot, slightly larger and more dramatically lit than the other slides.

---

## 02 · The problem

**Headline:** Crypto knowledge has no scoreboard.
**Body:**
- Millions of people follow the market, study tokens, spot trends — but there's no fun,
  low-stakes way to prove it against other people.
- Real trading means real exposure: you need capital, and a wrong call costs you the position.
- Fantasy sports solved this for sports fans 20 years ago: a fixed entry, a scored roster, a
  prize pool. Crypto never got its version — especially not one built for a phone, with a
  crypto-native wallet from the start.

**Image prompt (scene):** The card is almost bare — just a dim, undecorated price chart line
drifting across it, no badges, no tournament cards, no scoring, no floating props around it at
all. Smaller and further back than the other slides, with more black empty space around it,
conveying "nothing built for this yet."

---

## 03 · The solution

**Headline:** DraftGem: daily fantasy for crypto.
**Body:**
- Pick 5 Solana coins within a fixed budget. Enter a tournament. Watch the standings move live.
  Get paid automatically when it ends — straight to your wallet.
- Your score is just the sum of your five coins' real price moves. No dice, no house edge on the
  outcome — only what the market actually did.
- Built mobile-first for Solana Mobile, signed end-to-end with Mobile Wallet Adapter.

**Image prompt (scene):** The card shows the Draft page mid-build: a thin green FP progress bar
near the top reading "3,650 of 4,000 FP", and below it five coin slot rows, each with a round coin
icon, a category pill ("Hold", "Farm", "Pump", "Moon", "Degen" in their own colors) and an FP
number on the right. A small "AI" wand-and-stars pill badge floats near the bottom-right corner.

---

## 04 · It's a skill game — not gambling

**Headline:** Skill decides the outcome. Not chance.
**Body:**
- Every score is a deterministic function of real market prices, computed on-chain from
  attested, verifiable data — never a random number.
- Winning takes research and judgement: reading volatility, balancing a fixed budget across five
  picks, picking the right tournament format. That's the same skill-vs-luck test that lets
  fantasy sports operate as a game of skill in most jurisdictions — DraftGem applies that exact
  model to crypto.
- No pooled jackpot, no lottery mechanic. A fixed entry fee, a transparent prize structure shown
  before you play, and a program that pays out exactly what it promised.

**Image prompt (scene):** The card shows a "Place / Player / Score / Prize" results table header,
with one highlighted purple-outlined row reading "1 · You #1 · −2.71% · 95 SKR" — real, specific
numbers, nothing randomized. No floating props except a couple of small sparkle particles; keep
the frame clean and precise rather than playful, to underline "this is measured, not chance."

---

## 05 · How you play — Draft

**Headline:** Five picks. One budget. Real trade-offs.
**Body:**
- Every coin costs Fantasy Points (FP), priced by how much it actually moves — calm coins are
  cheap, wild ones are expensive.
- **Hold** 100 FP · **Farm** 300 FP · **Pump** 650 FP · **Moon** 1,000 FP · **Degen** 1,600 FP
- You get **4,000 FP** for **5 coins** — so an all-Degen roster is mathematically impossible, and
  an all-safe roster rarely wins.

**Image prompt (scene):** The card is a tight close-up on exactly five coin slot rows, each with a
round coin icon and a small red "×" remove-badge in its corner, each row clearly labelled with a
different category pill and FP amount — "Hold · 100 FP", "Farm · 300 FP", "Pump · 650 FP", "Moon ·
1,000 FP", "Degen · 1,600 FP" — with a green "4,000 FP" budget bar, nearly full, across the top.

---

## 06 · How you play — Compete

**Headline:** Join the lobby. Or run your own.
**Body:**
- A new tournament opens all the time — 1, 6, 12 or 24-hour rounds.
- Public or private: create your own and share a link to play only with friends.
- Pick a prize structure before you enter: **Top 1** winner-take-all, **Top 3**, **top 30%**,
  **top 50%**, or a 1-v-1 **PvP** duel.

**Image prompt (scene):** The card shows a tournament lobby entry: a payout badge "Top 3", a title
"50 SKR · Friday Draft", and a stats row "Players · Duration 1h · Starts in". Floating props: a
glowing padlock at top-left and two small round avatar-bubble icons at the right edge, each
connected to the card by a thin glowing cable — conveying "a private tournament, shared with
friends."

---

## 07 · How you play — Score & get paid

**Headline:** Scored on-chain. Paid on-chain.
**Body:**
- Each coin's result is its real % change from start to end, floored at −100% per coin so one
  rug can't sink you worse than one full slot.
- Your score is the **sum** of your five coins.
- The Solana program computes every score itself from recorded prices and sends prizes straight
  to winners' wallets — no manual payouts, nothing to claim from a person.

**Image prompt (scene):** The card shows a finished portfolio: five coin rows each with a small
colored percentage tag (some mint-green "+6.63%", one red "−2.71%"), and along the bottom a solid
mint-green bar reading "Paid out · View payout on Solscan" with a checkmark and an external-link
icon. Floating props: a small trophy at the top-left and two round coin discs (bold "S" symbol) at
the right, lightly glowing.

---

## 08 · AI portfolio — powered by Google AI Studio

**Headline:** No time to think? Let the AI draft it.
**Body:**
- One tap opens a risk slider — **Steady → Careful → Balanced → Bold → Moonshot** — and an AI
  model builds a 5-coin portfolio for that risk level, with a one-line reason for every pick.
- Built on **Google AI Studio / Gemini**'s free tier, with a fallback model chain so it keeps
  working even under rate limits.
- Nothing the model says is trusted blindly: every answer is validated on the server — five
  distinct real coins, total cost inside the 4,000 FP budget — before it ever reaches you.

**Image prompt (scene):** The card shows five small risk-level labels ("Steady · Careful ·
Balanced · Bold · Moonshot") above a thin horizontal gradient slider (green fading to red) with
its round white thumb sitting on "Moonshot", and below it a short list of coin rows tagged "Bold"
and "Degen" with FP numbers on the right. Floating prop: a glowing purple "AI" wand-and-stars pill
badge just off the bottom-right corner of the card, with a couple of sparkle particles around it.

---

## 09 · SKR — the home currency

**Headline:** Built around SKR, Solana Mobile's own token.
**Body:**
- SKR is the default currency: the automatic hourly tournaments run in SKR, it's the first
  choice when you create your own, and your SKR balance sits right in the header.
- Entry fees, prize pools and payouts are real SPL-token transfers, handled entirely by the
  on-chain program — the app never touches your keys.
- A beta-safe fee ceiling (500 SKR, about $10) keeps early rounds low-stakes while the game is
  proven out.

**Image prompt (scene):** A tight close-up: the card shows just a wallet balance pill, a round
black-and-white "S" (SKR) coin icon next to the number "195", sharply lit and enlarged as the clear
focal point. Floating props: two more "S" coin discs of different sizes drifting near the card,
gently glowing mint-green, echoing the coin icon on the card.

---

## 10 · ORE — mining-native, on the same board

**Headline:** ORE brings a mining-native token into the draft.
**Body:**
- ORE is a full second currency, not a bolt-on: create a tournament priced in ORE, enter with it,
  and get paid out in it, exactly like SKR.
- Because ORE has its own volatility profile, it widens what a "Degen" pick can look like across
  the game — more variety in how a portfolio can be built.
- Same beta-safety approach as every currency: a fee ceiling (5 ORE) while the game is young.

**Image prompt (scene):** The card shows a currency picker: four round pill chips in a row labelled
"SKR", "SOL", "ORE", "USDC", with the "ORE" chip clearly selected — brighter, outlined, its round
amber coin icon lit up — while the other three sit dim and unselected beside it. One matching
amber coin disc floats near the card, mirroring the selected chip.

---

## 11 · Earn 5% from your own tournament

**Headline:** Run a tournament. Earn every time it pays out.
**Body:**
- Anyone can create a tournament from the app: pick the entry fee, the prize structure, the
  round length, public or private.
- The creator automatically earns **5% of the prize pool**, sent by the program the moment the
  round pays out — no manual collection.
- Creation itself costs a small fixed fee (0.005 SOL) — cheap enough to run a tournament for a
  Discord, a group chat, or just a few friends.

**Image prompt (scene):** The card shows a solid mint-green rounded banner with a small dollar-sack
icon and bold dark text reading "Earn 5% of every prize pool", sitting above the start of a form
(a field row like "Who can join" beneath it, slightly out of focus). Floating props: one small gold
coin disc drifting off the bottom-right corner of the card, with a couple of sparkles.

---

## 12 · Built for Solana Mobile

**Headline:** Native to the Seeker, not bolted on.
**Body:**
- Every action — connecting, entering, creating, claiming — is signed with **Mobile Wallet
  Adapter**. Your keys never touch the app.
- On a Seeker, that means the phone's own built-in wallet handles every signature, with the same
  native prompt every other Solana Mobile app uses.
- The whole draft-to-payout loop was designed to work one-handed, in short sessions, between
  everything else you're doing on your phone.

**Image prompt (scene):** The card shows a logged-out top bar: the DraftGem wordmark on the left,
and on the right a rounded pill reading "Connect" next to a small wallet glyph icon, with a faint
ripple/glow around the pill as if just tapped. Floating prop: a single glowing chain-link "connect"
icon just above the pill, with a thin cable running down into it.

---

## 13 · How it's built

**Headline:** Three pieces, one loop.
**Body:**
- **Mobile app** — React Native / Expo, Mobile Wallet Adapter for every signature.
- **Cloudflare Worker backend** — runs the cron that prices coins, settles rounds and pays out;
  proxies RPC calls; talks to Google AI Studio for the AI portfolios.
- **Anchor program on Solana mainnet** — owns every dollar: creates tournaments, records prices,
  scores entries, and sends prizes. The app and backend can suggest, but only the program moves
  funds.
- Formats supported today: 4 currencies (SKR / SOL / ORE / USDC), 4 round lengths, 5 prize
  structures, public or private, single or multi-entry.

**Image prompt (scene):** Three small floating cards instead of one, arranged in a loose triangle:
the DraftGem Lobby card (as in slide 01) at left; a small rounded panel with a few lines of glowing
monospace log text ("Settlement: finalized, paid") at top right, standing in for the backend; and
the gem-mark logo itself, slightly larger, at bottom right, standing in for the on-chain program.
Thin glowing cable-lines connect all three into a closed triangular loop.

---

## 14 · Live on mainnet, launched carefully

**Headline:** Real money, deliberately bounded.
**Body:**
- DraftGem runs on Solana **mainnet** today, not a demo network.
- A self-audit pass covers every fund-moving instruction, with regression tests for the bugs it
  found and fixed before launch.
- Beta-stage entry-fee ceilings across every currency keep early rounds low-stakes on purpose,
  while the game proves itself out with real players.

**Image prompt (scene):** The card shows a tournament header with a small white "BETA" pill badge
next to the title, and below it a status line reading "Paid out" with a green checkmark. Floating
prop: a faint hexagonal outline of thin glowing lines wrapping loosely around the card like a
protective case, without covering the content.

---

## 15 · Closing

**Headline:** Show what you know about crypto.
**Body:**
- DraftGem: draft five coins, beat the field, get paid on-chain.
- Built for Solana Mobile · Live on Solana mainnet · CLOCK IN Hackathon submission
- draftgem.app

**Image prompt (scene):** The same Lobby-card composition as the cover, centered and dramatically
lit, gem-mark logo and sparkles included — but now with a few small particles of light drifting
upward and off the top edge of the frame, a quiet forward-looking close instead of a static one.
