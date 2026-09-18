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
