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

// 900 word pairs alone would collide constantly at real tournament counts (cron makes 288/day) —
// a 4-character tag from a different slice of the hash brings the collision odds low enough to
// call it unique in practice, and doubles as a short human-readable code for the tournament.
const CODE_SPACE = 36 ** 4; // 1,679,616

export function generatedTournamentName(id: bigint | number | string): string {
  const hash = splitmix64(BigInt(id));
  const a = ADJECTIVES[Number(hash % BigInt(ADJECTIVES.length))];
  const b = NOUNS[Number((hash / BigInt(ADJECTIVES.length)) % BigInt(NOUNS.length))];
  const code = Number((hash >> 20n) % BigInt(CODE_SPACE))
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `${a} ${b} #${code}`;
}

/** What the app shows for a tournament: its own name if a player set one, otherwise a generated one. */
export function tournamentDisplayName(id: bigint | number | string, meta: Pick<TournamentMeta, "name"> | undefined): string {
  return meta?.name ?? generatedTournamentName(id);
}
