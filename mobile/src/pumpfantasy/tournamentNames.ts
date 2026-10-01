import type { TournamentMeta } from "./customTournaments";

// Cron-made tournaments have no player-given name — only ones from the "+" screen do
// (worker/src/customTournaments.ts's meta). Every tournament still needs a short, unique
// label for its card, so one is generated from its id: same id -> always the same name,
// nothing to store, no two nearby cron ticks land on the same word pair (a plain hash
// would cluster since ids are 5-minute-aligned timestamps — mixed with a splitmix64 step).

// Crypto/degen flavored, not generic sci-fi words — this is a crypto fantasy app. No
// "Airdrop"/"Mint" or anything that could read as a real promise of free tokens or an
// NFT — these are just tournament names, not features.
const ADJECTIVES = [
  "Bullish", "Diamond", "Turbo", "Degenerate", "Based", "Leveraged", "Onchain", "Frosty",
  "Savage", "Volatile", "Pumped", "Liquid", "Anon", "Moonbound", "Decentralized", "Rekt",
];
const NOUNS = [
  "Moonshot", "Node", "Rally", "Pump", "Rocket", "Whale", "Ape", "Bagholder",
  "Gwei", "Satoshi", "Ledger", "Vault", "Gas", "Candle", "Fork", "Block",
];

const MASK64 = (1n << 64n) - 1n;

function splitmix64(seed: bigint): bigint {
  let n = (seed ^ (seed >> 33n)) & MASK64;
  n = (n * 0xff51afd7ed558ccdn) & MASK64;
  n = (n ^ (n >> 33n)) & MASK64;
  n = (n * 0xc4ceb9fe1a85ec53n) & MASK64;
  return (n ^ (n >> 33n)) & MASK64;
}

export function generatedTournamentName(id: bigint | number | string): string {
  const hash = splitmix64(BigInt(id));
  const a = ADJECTIVES[Number(hash % BigInt(ADJECTIVES.length))];
  const b = NOUNS[Number((hash / BigInt(ADJECTIVES.length)) % BigInt(NOUNS.length))];
  // No unique tag: the card shows the start date next to the name (see tournamentDayLabel), which
  // is what actually tells tournaments apart in a long history.
  return a + ' ' + b;
}

/** Start day as DD.MM in the player's own timezone — shown on cards so runs are told apart. */
export function tournamentDayLabel(startTs: bigint | number): string {
  const d = new Date(Number(startTs) * 1000);
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Start day and time as "DD.MM HH:MM" in the player's own timezone — the tournament title's own date+time. */
export function tournamentDayTimeLabel(startTs: bigint | number): string {
  const d = new Date(Number(startTs) * 1000);
  const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return tournamentDayLabel(startTs) + ' ' + time;
}

/** What the app shows for a tournament: its own name if a player set one, otherwise a generated one. */
export function tournamentDisplayName(id: bigint | number | string, meta: Pick<TournamentMeta, "name"> | undefined): string {
  return meta?.name ?? generatedTournamentName(id);
}
