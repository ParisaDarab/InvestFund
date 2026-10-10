/**
 * AES-256-GCM encryption of secrets at rest (OAuth tokens, LLM API keys, demo credentials).
 *
 * Format (docs/DATABASE.md §1 "Secrets"): `iv (12 bytes) ‖ ciphertext ‖ auth tag (16 bytes)`,
 * stored as `bytea` next to a `*_key_version smallint` column. Every call uses a fresh random
 * 96-bit IV, so encrypting the same plaintext twice gives different ciphertexts.
 *
 * Key rotation: the key ring holds the current key (used for every new encryption) and any
 * previous keys (decryption only). Rows encrypted with an old version stay readable until a
 * re-encryption job moves them to the current one.
 *
 * Never log plaintext, keys or ciphertext. The key ring keeps its keys in a private field and
 * serialises (JSON, pino, `util.inspect`) to version numbers only. Errors never quote input.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

export const IV_BYTES = 12;
export const AUTH_TAG_BYTES = 16;
export const KEY_BYTES = 32;
const ALGORITHM = 'aes-256-gcm';

export interface EncryptedValue {
  /** `iv ‖ ciphertext ‖ tag`. */
  readonly ciphertext: Buffer;
  readonly keyVersion: number;
}

/** What services depend on (tests can inject a fake). */
export interface Cipher {
  encrypt(plaintext: string): EncryptedValue;
  /** Throws `DecryptionError` for an unknown key version or tampered/truncated ciphertext. */
  decrypt(ciphertext: Buffer, keyVersion: number): string;
}

/** Decryption failed. Deliberately generic: says nothing about the key, data or position. */
export class DecryptionError extends Error {
  override readonly name = 'DecryptionError';

  constructor() {
    super('Decryption failed');
  }
}

export interface KeyRingConfig {
  readonly currentKeyVersion: number;
  /** Every usable key by version, including the current one. */
  readonly keys: ReadonlyMap<number, Buffer>;
}

export class AesGcmCipher implements Cipher {
  readonly #keys: ReadonlyMap<number, Buffer>;
  readonly #currentVersion: number;

  constructor(config: KeyRingConfig) {
    const keys = new Map<number, Buffer>();
    for (const [version, key] of config.keys) {
      if (!Number.isInteger(version) || version < 1) throw new Error('Invalid key version');
      if (key.length !== KEY_BYTES) throw new Error('Encryption keys must be 32 bytes');
      keys.set(version, Buffer.from(key)); // a private copy
    }
    if (!keys.has(config.currentKeyVersion)) {
      throw new Error('The current key version has no key');
    }
    this.#keys = keys;
    this.#currentVersion = config.currentKeyVersion;
  }

  get currentKeyVersion(): number {
    return this.#currentVersion;
  }

  encrypt(plaintext: string): EncryptedValue {
    const key = this.#keys.get(this.#currentVersion);
    if (key === undefined) throw new Error('The current key version has no key');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: Buffer.concat([iv, body, cipher.getAuthTag()]),
      keyVersion: this.#currentVersion,
    };
  }

  decrypt(ciphertext: Buffer, keyVersion: number): string {
    const key = this.#keys.get(keyVersion);
    if (key === undefined || ciphertext.length < IV_BYTES + AUTH_TAG_BYTES) {
      throw new DecryptionError();
    }
    const iv = ciphertext.subarray(0, IV_BYTES);
    const tag = ciphertext.subarray(ciphertext.length - AUTH_TAG_BYTES);
    const body = ciphertext.subarray(IV_BYTES, ciphertext.length - AUTH_TAG_BYTES);
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch {
      // OpenSSL's message ("Unsupported state or unable to authenticate data") adds nothing useful.
      throw new DecryptionError();
    }
  }

  /** Safe summary for logs and JSON: versions only, never key material. */
  toJSON(): { currentKeyVersion: number; keyVersions: number[] } {
    return { currentKeyVersion: this.#currentVersion, keyVersions: [...this.#keys.keys()] };
  }

  [inspect.custom](): string {
    return `AesGcmCipher ${JSON.stringify(this.toJSON())}`;
  }
}
