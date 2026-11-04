# DraftGem — Solana dApp Store listing (draft, 2026-11-02)

Everything here is ready to paste into the Publisher Portal. No placeholders are left; the notes at the end
say what is still open. The field limits below are the ones from memory of the SwapKings
listing — the portal shows the real limits as you type, trim if it complains.

---

## Basics

| Field | Value |
|---|---|
| App name | `DraftGem` |
| Android package | `app.draftgem` (changed from `com.pumpfantasy.app` on 2026-11-02; permanent once listed) |
| Category | Games |
| Version | 1.0.0 (beta) |
| Website | https://draftgem.app |
| Privacy Policy | https://draftgem.app/privacy (live once landing/privacy.html is deployed) |
| Terms of Use | https://draftgem.app/terms (live once landing/terms.html is deployed) |
| Support email | `team@draftgem.app` |
| X / Twitter | `https://x.com/draftgemapp` |
| Source code | https://github.com/winkscan/draftgem |
| Demo video | https://www.youtube.com/watch?v=NS6-Q7MMCy4 |
| Copyright | © 2026 DraftGem |
| Keywords | fantasy, crypto, tournament, solana, skr, skill game, defi, seeker |

---

## Short description (pick one)

**A** (60 chars, plain)
```
Draft 5 Solana coins, beat other players, get paid on-chain.
```

**B** (64 chars, genre first)
```
Fantasy tournaments for crypto. Pick 5 coins, outplay the field.
```

**C** (48 chars, punchy)
```
Pick 5 coins. Beat the field. Get paid on-chain.
```

**Chosen 2026-11-05 (user):** `Skill Over Luck. The Ultimate Crypto Draft.` (43 chars) replaces the old subtitle "Pick 5 coins. Beat the field. Get paid on-chain." everywhere.

Earlier recommendation: **A**. It says what you do and what happens, and "skill game" lives in the long text.

---

## Long description

```
DraftGem is a skill game for people who know crypto. Draft five Solana coins inside a 4,000 FP budget, enter a tournament and see how your market knowledge stacks up against other players. No leverage, no liquidation: the most you can lose is the entry fee.

HOW IT WORKS
• Every coin has a price in Fantasy Points set by how much it really moves. Calm coins are cheap, wild ones are expensive.
• Pick 5 coins within 4,000 FP. An all-wild portfolio is impossible, and an all-calm one rarely wins.
• Enter a tournament, follow the standings live and collect your prize when the round ends. Rounds last from 1 to 24 hours, and the Lobby always has a new tournament opening.
• Prizes are paid on-chain by a Solana program straight to your wallet. Entry fees sit in the program's vault, not in anyone's wallet, and every tournament can be verified on Solscan.

BUILT FOR SEEKER
• Sign everything with your wallet through Mobile Wallet Adapter. DraftGem never sees your keys.
• SKR is the main currency. SOL, ORE and USDC tournaments are supported too.

AND MORE
• AI portfolio: choose a risk level from Steady to Moonshot and let AI draft a portfolio for you.
• Create your own public or private tournament, share the link with friends and earn 5% of its prize pool.
• Track your profit and loss and share it.

DraftGem is a game of skill in beta. Only use money you can afford to lose. You must be of legal age in your country, and the app may not be available where such games are restricted. Nothing here is investment advice.
```

Facts checked against the app and README: 4,000 FP / 5 coins, rounds 1, 6, 12 or 24 h, prize paid by the program,
vault PDA, Solscan-verifiable, MWA, SKR/SOL/ORE/USDC, AI risk slider Steady to Moonshot, creator share 5%, P&L chart
with share.

---

## Release notes (version 1.0.0)

```
First release on the Solana dApp Store.
• Draft 5 Solana coins within a 4,000 FP budget and join tournaments in SKR, SOL, ORE or USDC
• Live standings and final results
• AI portfolio builder with five risk levels
• Create public or private tournaments and earn 5% of the prize pool
• Sign with Mobile Wallet Adapter
Beta: entry fees are capped at small amounts.
```

---

## Notes for reviewers (testing instructions)

```
No account or sign-up is needed.

Without a wallet you can open the Lobby, Live, Results and Guide tabs and use the AI portfolio builder (a limited number of free generations a day).

To enter a tournament, connect a Solana wallet that holds SKR (the automatic Lobby tournaments cost 100 SKR; the fee is shown on each card) and a little SOL for network fees. Entries are real mainnet transactions. During the beta, entry fees are capped at small amounts.

Walkthrough video: https://www.youtube.com/watch?v=NS6-Q7MMCy4
```

Optional last line, **only if you want to offer it**: `If you need a funded test wallet, write to team@draftgem.app.`

---

## Content / age rating answers (what to tick, honestly)

- Real-money element: **yes**. Players pay entry fees in crypto and prizes are paid in crypto. Declare it, do not hide it.
- Nature of it: a skill game (score = sum of real coins' % change, no random draw, no jackpot).
- Audience: **adults only (18+)**.
- Violence, sexual content, user-to-user chat: none. User-generated content: tournament names only.
- Permissions: the app asks for no special Android permissions (none in app.json).
- Ads / trackers: none.

---

## Things to know before submitting

1. **Package name is now `app.draftgem`** (was `com.pumpfantasy.app`). It is a different app to Android: the beta APK from the GitHub release (old package) will not update to the new build, testers install the new one fresh. Deep-link scheme: `draftgem://` is new, `pumpfantasy://` still works (the worker's share pages still send it).
2. **Signing key.** Updates are only accepted if signed with the same key as the first release. A new package means EAS creates a NEW keystore at the first build under `app.draftgem` — from then on keep those credentials as they are (and back them up: `eas credentials`).
3. **versionCode** is now explicit in app.json (1). Raise it by 1 for every later release.
4. **Repository license.** The repo has no license of its own: `mobile/LICENSE` is the Expo template's MIT text (copyright 650 Industries). Decide whether the portal's license field should point to something and what license DraftGem itself uses.
