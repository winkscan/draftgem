import { PublicKey } from "@solana/web3.js";

export function ellipsify(address: string | PublicKey, chars = 4): string {
  const s = typeof address === "string" ? address : address.toBase58();
  if (s.length <= chars * 2 + 3) return s;
  return `${s.slice(0, chars)}...${s.slice(-chars)}`;
}

export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / 1_000_000_000;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * 1_000_000_000);
}

export function formatSol(lamports: number | bigint, decimals = 3): string {
  return lamportsToSol(lamports).toFixed(decimals);
}

/** SOL amount with just enough decimals to be readable, no trailing zeros — for card titles ("10 SOL", "0.05 SOL"). */
export function formatSolCompact(lamports: number | bigint): string {
  const sol = lamportsToSol(lamports);
  if (sol === 0) return "0";
  const decimals = sol >= 100 ? 0 : sol >= 1 ? 2 : sol >= 0.01 ? 3 : 6;
  const s = sol.toFixed(decimals);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** A round's length as a short label: "10m", "1h", "6h". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export function bpsToPercentLabel(bps: number): string {
  const pct = bps / 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatCountdown(targetUnixSeconds: number, nowUnixSeconds: number): string {
  const diff = Math.max(0, targetUnixSeconds - nowUnixSeconds);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** USD price at any magnitude — meme coins go down to 1e-9, so fixed decimals aren't enough. */
export function formatPrice(p: number): string {
  if (!isFinite(p) || p <= 0) return "0";
  if (p >= 1000) return p.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  const decimals = -Math.floor(Math.log10(p)) + 3; // 4 significant digits
  return p.toFixed(Math.min(decimals, 14));
}

export function formatUsdCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatAge(ageDays: number): string {
  if (ageDays < 1) return `${Math.max(1, Math.round(ageDays * 24))} hours`;
  if (ageDays < 60) return `${Math.round(ageDays)} days`;
  if (ageDays < 730) return `${Math.round(ageDays / 30)} months`;
  return `${(ageDays / 365).toFixed(1)} years`;
}
