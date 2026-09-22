import {
  Ed25519Program,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import { tournamentPda, vaultPda, entryPda, assetPda } from "./pdas";
import { PROGRAM_ID } from "./config";
import { BinaryWriter } from "./binary";
import type { Attestation } from "./attestation";
import { TOKEN_PROGRAM_ID, createAtaIdempotentIx, getAssociatedTokenAddress, isNativeMint } from "./currency";

export interface SignAndSend {
  (transaction: Transaction, minContextSlot: number): Promise<string>;
}

// idl/pumpfantasy.json → instructions[].find(i => i.name === "enter_tournament").discriminator
// Built by hand (not via Anchor's instruction coder) for the same reason
// accounts.ts hand-decodes accounts — see binary.ts.
const ENTER_TOURNAMENT_DISCRIMINATOR = Buffer.from([19, 21, 109, 109, 227, 108, 232, 25]);

// Builds and sends a real enter_tournament transaction: pays the entry fee
// into the tournament's PDA vault and records the 5 picked mints on-chain,
// each with its server-attested fp_cost. No pre-registered asset accounts
// are referenced — the attestation (see worker/src/attestation.ts's
// signAttestation, fetched via attestation.ts's fetchAttestation) is what
// lets the on-chain program trust the fp_cost without looking it up itself.
//
// The transaction carries the attested Ed25519 signature as a native
// Ed25519Program instruction immediately BEFORE enter_tournament — Solana
// verifies that signature at the runtime level before this program's
// handler even runs; enter_tournament.rs's verify_attestation then just
// confirms it's the RIGHT attestation (right signer, right message) sitting
// there. Order matters: the ed25519 instruction must be index i-1 relative
// to enter_tournament, so nothing else may be inserted between them.
export async function enterTournament(
  connection: Connection,
  player: PublicKey,
  signAndSendTransaction: SignAndSend,
  tournamentId: bigint | number,
  attestation: Attestation,
  entryIndex: number,
  mint: PublicKey = PublicKey.default,
): Promise<string> {
  const [tournament] = tournamentPda(tournamentId);
  const [vault] = vaultPda(tournament);
  const [entry] = entryPda(tournament, player, entryIndex);
  const native = isNativeMint(mint);
  const vaultTokenAccount = native ? vault : getAssociatedTokenAddress(vault, mint);
  const playerTokenAccount = native ? player : getAssociatedTokenAddress(player, mint);
  const mintAccount = native ? vault : mint;
  const tokenProgram = native ? SystemProgram.programId : TOKEN_PROGRAM_ID;

  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: Uint8Array.from(attestation.publicKey),
    message: Uint8Array.from(attestation.message),
    signature: Uint8Array.from(attestation.signature),
  });

  const writer = new BinaryWriter().writeBytes(ENTER_TOURNAMENT_DISCRIMINATOR).writeU16(entryIndex);
  for (const pick of attestation.picks) writer.writePubkey(new PublicKey(pick.mint));
  for (const pick of attestation.picks) writer.writeU32(pick.fpCost);
  writer.writeI64(attestation.expiry);

  // Account order/flags must match programs/pumpfantasy/src/instructions/enter_tournament.rs's
  // `EnterTournament` accounts struct exactly.
  const enterIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: playerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mintAccount, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: entry, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // The picked coins' price accounts, in pick order. The first entry to pick a coin creates it and
      // pays its rent (~0.0011 SOL) — refunded when the tournament ends; later entries pay nothing.
      ...attestation.picks.map((pick) => ({
        pubkey: assetPda(tournament, new PublicKey(pick.mint))[0],
        isSigner: false,
        isWritable: true,
      })),
    ],
    data: writer.toBuffer(),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const minContextSlot = await connection.getSlot("confirmed");

  // For an SPL-denominated tournament, make sure the player's own ATA exists first (they pay
  // its tiny rent themselves, in the same approval — same as any normal token deposit flow).
  const ixs = native ? [ed25519Ix, enterIx] : [createAtaIdempotentIx(player, player, mint), ed25519Ix, enterIx];
  const tx = new Transaction({ feePayer: player, blockhash, lastValidBlockHeight }).add(...ixs);
  return signAndSendTransaction(tx, minContextSlot);
}
