import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import { tournamentPda, vaultPda, entryPda } from "./pdas";
import { PROGRAM_ID } from "./config";

export interface SignAndSend {
  (transaction: Transaction, minContextSlot: number): Promise<string>;
}

// idl/pumpfantasy.json → instructions[].find(i => i.name === "enter_tournament").discriminator
// Built by hand (not via Anchor's instruction coder) for the same reason
// accounts.ts hand-decodes accounts — see binary.ts. Payload is the
// discriminator followed by the u16-LE entry_index arg.
const ENTER_TOURNAMENT_DISCRIMINATOR = Buffer.from([19, 21, 109, 109, 227, 108, 232, 25]);

// Builds and sends a real enter_tournament transaction: pays the entry fee
// into the tournament's PDA vault and records the 5 chosen
// TournamentAsset picks on-chain. `pickAssetPdas` must be exactly 5 distinct
// asset PDAs (enforced again on-chain — this is just where the tx is built).
// `entryIndex` selects which of this player's entries this is — always 0
// for a Single-mode tournament (the program rejects anything else there),
// the next free index for Multiple mode.
export async function enterTournament(
  connection: Connection,
  player: PublicKey,
  signAndSendTransaction: SignAndSend,
  tournamentId: bigint | number,
  pickAssetPdas: PublicKey[],
  entryIndex: number,
): Promise<string> {
  const [tournament] = tournamentPda(tournamentId);
  const [vault] = vaultPda(tournament);
  const [entry] = entryPda(tournament, player, entryIndex);

  const entryIndexBuf = Buffer.alloc(2);
  entryIndexBuf.writeUInt16LE(entryIndex);

  // Account order/flags must match programs/pumpfantasy/src/instructions/enter_tournament.rs's
  // `EnterTournament` accounts struct exactly.
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: entry, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ...pickAssetPdas.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })),
    ],
    data: Buffer.concat([ENTER_TOURNAMENT_DISCRIMINATOR, entryIndexBuf]),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const minContextSlot = await connection.getSlot("confirmed");

  const tx = new Transaction({ feePayer: player, blockhash, lastValidBlockHeight }).add(ix);
  return signAndSendTransaction(tx, minContextSlot);
}
