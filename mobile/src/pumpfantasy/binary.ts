import { PublicKey } from "@solana/web3.js";

// Minimal borsh-style fixed-layout reader/writer for this program's account
// structs and instruction args. Written to replace @coral-xyz/anchor's
// runtime coder (BorshAccountsCoder/InstructionCoder) — that coder computes
// account/instruction discriminators via sha256 at runtime
// (dist/cjs/utils/sha256.js: `new TextDecoder().decode(sha256(data))`), and
// that path throws "undefined is not a function" under Hermes even with
// TextEncoder/TextDecoder polyfilled (confirmed: the exact same code works
// fine under Node, only breaks on-device). Since the IDL already embeds
// every discriminator as a plain byte array, there's no need to recompute
// anything at runtime — just read the bytes straight from the IDL/constants
// and hand-roll the (very simple, fixed-size-field-only) struct layouts.
export class BinaryReader {
  private offset = 0;
  constructor(private readonly buf: Buffer) {}

  skipDiscriminator(): this {
    this.offset += 8;
    return this;
  }

  readPubkey(): PublicKey {
    const bytes = this.buf.subarray(this.offset, this.offset + 32);
    this.offset += 32;
    return new PublicKey(bytes);
  }

  readU8(): number {
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readU16(): number {
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  readU32(): number {
    const v = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  readI32(): number {
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  readU64(): bigint {
    const v = this.buf.readBigUInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  readI64(): bigint {
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  /** Reads a fieldless (C-like) enum's 1-byte variant tag. */
  readEnumTag(): number {
    return this.readU8();
  }
}

export class BinaryWriter {
  private chunks: Buffer[] = [];

  writeBytes(bytes: number[] | Buffer): this {
    this.chunks.push(Buffer.from(bytes));
    return this;
  }

  writePubkey(pubkey: PublicKey): this {
    this.chunks.push(pubkey.toBuffer());
    return this;
  }

  writeU16(value: number): this {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(value);
    this.chunks.push(b);
    return this;
  }

  writeU64(value: bigint | number): this {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(value));
    this.chunks.push(b);
    return this;
  }

  writeI64(value: bigint | number): this {
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(BigInt(value));
    this.chunks.push(b);
    return this;
  }

  writeU32(value: number): this {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(value);
    this.chunks.push(b);
    return this;
  }

  writeI32(value: number): this {
    const b = Buffer.alloc(4);
    b.writeInt32LE(value);
    this.chunks.push(b);
    return this;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}
