// A small Borsh reader driven by an Anchor IDL. It decodes an account's bytes
// with nothing but the IDL's own type definitions, so the browser can read a
// deal straight from the chain without the API, Anchor, or a generated
// client. It knows the IDL types the escrow program uses; any other type is
// an error, never a guess.

/** An Anchor IDL type, as JSON. */
export type IdlType =
  | string
  | { array: [IdlType, number] }
  | { vec: IdlType }
  | { option: IdlType }
  | { defined: { name: string } };

interface IdlField {
  name: string;
  type: IdlType;
}

interface IdlTypeDef {
  name: string;
  type:
    | { kind: "struct"; fields: readonly IdlField[] }
    | { kind: "enum"; variants: readonly { name: string; fields?: unknown }[] };
}

/** The parts of an Anchor IDL the reader uses. */
export interface DecodableIdl {
  accounts: readonly { name: string; discriminator: readonly number[] }[];
  types: readonly { name: string; type: { kind: string } }[];
}

/**
 * pubkey → base58 string, u8/u16/u32/i8/i16/i32 → number, u64/i64 → bigint,
 * bool → boolean, [u8; N] → Uint8Array, other arrays and vecs → arrays,
 * option → value or null, struct → object keyed by field name, enum → the
 * variant's name.
 */
export type Decoded =
  | string
  | number
  | bigint
  | boolean
  | null
  | Uint8Array
  | Decoded[]
  | { [field: string]: Decoded };

export class DecodeError extends Error {
  override name = "DecodeError";
}

/** Anchor's 8-byte account discriminator, then the account's struct. */
export function decodeIdlAccount(
  idl: DecodableIdl,
  accountName: string,
  data: Uint8Array,
): { [field: string]: Decoded } {
  const account = idl.accounts.find((entry) => entry.name === accountName);
  if (!account) {
    throw new DecodeError(`The IDL has no ${accountName} account.`);
  }
  const discriminator = account.discriminator;
  if (data.length < discriminator.length) {
    throw new DecodeError(
      `The account is ${data.length} bytes, too short for a ${accountName}.`,
    );
  }
  if (discriminator.some((byte, index) => data[index] !== byte)) {
    throw new DecodeError(`The account is not a ${accountName}.`);
  }
  const reader = new Reader(idl, data, discriminator.length);
  const value = reader.read({ defined: { name: accountName } });
  // Anchor allocates the account's maximum size, so bytes after the struct
  // are the unused tail of the allocation, not part of the value.
  return value as { [field: string]: Decoded };
}

const INTEGERS: Record<string, { bytes: number; signed: boolean }> = {
  u8: { bytes: 1, signed: false },
  i8: { bytes: 1, signed: true },
  u16: { bytes: 2, signed: false },
  i16: { bytes: 2, signed: true },
  u32: { bytes: 4, signed: false },
  i32: { bytes: 4, signed: true },
  u64: { bytes: 8, signed: false },
  i64: { bytes: 8, signed: true },
};

/** A vec longer than this is a corrupt length prefix, not a real account. */
const MAX_VEC = 1024;

class Reader {
  private readonly view: DataView;

  constructor(
    private readonly idl: DecodableIdl,
    private readonly data: Uint8Array,
    private offset: number,
  ) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  read(type: IdlType): Decoded {
    if (typeof type === "string") return this.primitive(type);
    if ("array" in type) {
      const [item, length] = type.array;
      if (item === "u8") return this.take(length).slice();
      return Array.from({ length }, () => this.read(item));
    }
    if ("vec" in type) {
      const length = this.integer("u32") as number;
      if (length > MAX_VEC) {
        throw new DecodeError(`A list claims ${length} items.`);
      }
      return Array.from({ length }, () => this.read(type.vec));
    }
    if ("option" in type) {
      const tag = this.integer("u8");
      if (tag === 0) return null;
      if (tag !== 1) throw new DecodeError(`An option has tag ${tag}.`);
      return this.read(type.option);
    }
    if ("defined" in type) return this.defined(type.defined.name);
    throw new DecodeError(`Unsupported IDL type ${JSON.stringify(type)}.`);
  }

  private defined(name: string): Decoded {
    const def = this.idl.types.find((entry) => entry.name === name) as
      | IdlTypeDef
      | undefined;
    if (!def) throw new DecodeError(`The IDL has no ${name} type.`);
    if (def.type.kind === "struct") {
      const value: { [field: string]: Decoded } = {};
      for (const field of def.type.fields) {
        value[field.name] = this.read(field.type);
      }
      return value;
    }
    if (def.type.kind === "enum") {
      const index = this.integer("u8") as number;
      const variant = def.type.variants[index];
      if (!variant) {
        throw new DecodeError(`${name} has no variant ${index}.`);
      }
      if (variant.fields) {
        throw new DecodeError(`${name}.${variant.name} carries data.`);
      }
      return variant.name;
    }
    throw new DecodeError(`Unsupported IDL type kind for ${name}.`);
  }

  private primitive(type: string): Decoded {
    if (type === "pubkey") return encodeBase58(this.take(32));
    if (type === "bool") {
      const byte = this.integer("u8");
      if (byte !== 0 && byte !== 1) {
        throw new DecodeError(`A bool has value ${byte}.`);
      }
      return byte === 1;
    }
    if (type in INTEGERS) return this.integer(type);
    throw new DecodeError(`Unsupported IDL type ${type}.`);
  }

  private integer(type: string): number | bigint {
    const { bytes, signed } = INTEGERS[type]!;
    this.need(bytes);
    const at = this.offset;
    this.offset += bytes;
    switch (bytes) {
      case 1:
        return signed ? this.view.getInt8(at) : this.view.getUint8(at);
      case 2:
        return signed
          ? this.view.getInt16(at, true)
          : this.view.getUint16(at, true);
      case 4:
        return signed
          ? this.view.getInt32(at, true)
          : this.view.getUint32(at, true);
      default:
        return signed
          ? this.view.getBigInt64(at, true)
          : this.view.getBigUint64(at, true);
    }
  }

  private take(length: number): Uint8Array {
    this.need(length);
    const bytes = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  private need(length: number): void {
    if (this.offset + length > this.data.length) {
      throw new DecodeError("The account data ends early.");
    }
  }
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Bitcoin-alphabet base58, the way Solana writes addresses. */
export function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58[digits[i]!];
  return out;
}

/** Standard base64 (an RPC's `base64` encoding) to bytes. */
export function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
