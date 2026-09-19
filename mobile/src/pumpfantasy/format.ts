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

export function bpsToPercentLabel(bps: number): string {
  const pct = bps / 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatCountdown(targetUnixSeconds: number, nowUnixSeconds: number): string {
  const diff = Math.max(0, targetUnixSeconds - nowUnixSeconds);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
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
