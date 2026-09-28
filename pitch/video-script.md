# DraftGem — demo video script

For the CLOCK IN Solana Mobile Hackathon submission (3-minute demo video, real device). Target
runtime **2:55–3:00**. All footage is real screen recording of the live mainnet app — no mockups,
no AI-generated shots (those are only for the pitch deck).

**Before recording:**
- Fresh install or logged-out state for the cold open, so the wallet-connect moment is real.
- A wallet with a small SKR + SOL balance already funded (don't record the funding itself).
- Record portrait, on the Seeker or an Android phone — check the CLOCK IN submission page for the
  exact required aspect ratio/format before exporting.
- Keep taps deliberate and a little slower than natural — viewers need a beat to read each screen.
- Voiceover is written to be recorded separately and mixed in; captions can reuse the same lines
  as on-screen text if you'd rather not use voice at all.

Score weighting this cuts against (so nothing important gets rushed): **AI 20, SKR Integration
20, UX 15, UI 15, Innovation 15, Ecosystem Impact 15.**

---

## 00:00–0:12 — Cold open

**Screen:** App icon → splash → Lobby, logged out. Let the "Connect" pill in the header sit on
screen for a beat.
**Caption / VO:** *"DraftGem — a skill game for people who know crypto. Live on Solana mainnet."*
**Why:** one clean brand beat before anything else, sets UI tone immediately.

---

## 0:12–0:30 — The hook

**Screen:** Slow pan/scroll down the Lobby list — a few real tournament cards visible (pool,
players, countdown).
**Caption / VO:** *"Millions of people follow the market. DraftGem is the format that finally
lets you prove it — draft five coins, beat the field, get paid on-chain."*
**Why:** the "why this exists" line, over real UI instead of a static problem slide.

---

## 0:30–1:00 — Connect & Draft

**Screen:**
1. Tap **Connect** → Mobile Wallet Adapter's native sheet opens (real MWA UI, not app UI) →
   approve.
2. Back in the app, open a tournament → Draft screen.
3. Tap through picking 5 coins: show at least one of each category label (Hold/Farm/Pump/Moon/
   Degen) landing in a slot, and the FP budget bar filling toward ~4,000.

**Caption / VO:** *"Every action is signed with Mobile Wallet Adapter — your keys never touch the
app. Five picks, one fixed budget: cheap, calm coins next to expensive, wild ones."*
**Why:** this is the single most important 30 seconds — core loop + MWA signing (Ecosystem
Impact) + UI (category pills, budget bar) in one unbroken take.

---

## 1:00–1:20 — Enter with SKR

**Screen:** Tap **Enter**, MWA signing sheet appears again (a real SPL-token transfer this time),
approve → success screen ("You're in") → back to the tournament, entry now visible.
**Caption / VO:** *"Entry fees, prize pools and payouts run on SKR — Solana Mobile's own token —
real SPL transfers, handled entirely by the on-chain program."*
**Why:** dedicated, unhurried SKR beat — this alone is worth 20 of the scoring points.

---

## 1:20–1:45 — AI portfolio

**Screen:** Open the AI page → drag the risk slider across Steady → Moonshot a couple of times
(let the coin list underneath visibly change) → land on one level → tap **Generate** → the 5-coin
result appears with its reasons → tap **Use portfolio**, back on the Draft screen with it applied.
**Caption / VO:** *"No time to think? An AI model — Google AI Studio's Gemini — drafts a portfolio
for your risk level, with a reason for every pick. Every answer is checked on the server before it
ever reaches you."*
**Why:** dedicated, unhurried AI beat — worth 20 of the scoring points, and it's a genuinely fun
moment to watch (the slider + regenerating list).

---

## 1:45–2:05 — Live, then paid

**Screen:** Cut to the Live tab on an in-progress or just-finished real tournament → standings with
real live percentages moving → cut to Results: the same tournament finalized, your entry's row
highlighted with its score and prize → tap the **Paid out · View payout on Solscan** pill → real
Solscan transaction page opens for a half-second.
**Caption / VO:** *"Your score is the sum of your five coins' real moves. The program computes it
and pays the winner straight to their wallet — provable on-chain, right here on Solscan."*
**Why:** proves this is real mainnet money moving, not a demo network — a strong trust beat.

---

## 2:05–2:30 — Create your own & ORE

**Screen:** Tap **+** → Create tournament page: show the green "Earn 5% of every prize pool"
banner for a beat → scroll the currency picker and tap **ORE** → fill a name → tap Create → MWA
signs the small creation fee → new tournament appears in the Lobby.
**Caption / VO:** *"Anyone can run their own tournament — pick the currency, even ORE, set the
prizes — and earn 5% of the pool automatically every time it pays out."*
**Why:** Innovation (player-made tournaments + creator earnings) and a second real currency in the
same beat, without needing a separate segment.

---

## 2:30–2:50 — Built for Solana Mobile

**Screen:** Quick handheld-feeling montage (3–4 short cuts, ~4s each): the Connect flow again from
a different angle, a tournament card with its share-link icon tapped (native share sheet), the
profile page's SKR balance, the Guide page's "It's a skill game, not gambling" section scrolling
by.
**Caption / VO:** *"Built mobile-first for Solana Mobile and the Seeker — a skill game, not a
lottery: your score is math on real prices, not chance."*
**Why:** closes the Innovation/legal-framing point and the Ecosystem Impact point together, fast.

---

## 2:50–3:00 — Close

**Screen:** Back to the Lobby, then a clean cut to a black frame with the DraftGem gem-mark logo
centered and "draftgem.app" beneath it.
**Caption / VO:** *"DraftGem. Draft five coins. Beat the field. Get paid on-chain. Live on Solana
mainnet — draftgem.app."*

---

## Shot list checklist (record these first, edit second)

- [ ] Cold open: app icon → splash → logged-out Lobby
- [ ] Lobby scroll, 2–3 real tournament cards visible
- [ ] Connect: real MWA sheet, approve
- [ ] Draft: 5 picks, all 5 category labels visible at some point, budget bar filling
- [ ] Enter: real MWA signing sheet for the SKR transfer, success screen
- [ ] AI page: slider moving across levels, Generate, Use portfolio
- [ ] Live tab: real moving percentages
- [ ] Results: your row highlighted, score + prize, "Paid out" pill → Solscan tx page
- [ ] Create tournament: earn-5% banner, ORE selected, Create → MWA fee signature
- [ ] Share-link tap → native share sheet
- [ ] Profile: SKR balance visible
- [ ] Guide: skill-game section scrolling
- [ ] Closing card: gem-mark logo + draftgem.app

## Notes

- If Live footage of real percentages moving isn't available at record time, use a tournament
  that's actually mid-round rather than staging it — judges can tell.
- Keep every MWA sheet on screen long enough to read "DraftGem" as the requesting app — that's the
  wallet-identity fix paying off on camera.
- If 3:00 is tight after editing, the first thing to trim is the 2:30–2:50 montage, not the AI or
  SKR beats — those two map directly to 40 of the 100 scoring points.
