/** AES-256-GCM cipher: round trip, tamper detection, key rotation and log redaction (AC5, AC6). */
import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { captureLogs } from '../../../__tests__/support.js';
import { createLogger, REDACTED } from '../../logger/logger.js';
import { AesGcmCipher, AUTH_TAG_BYTES, DecryptionError, IV_BYTES } from '../cipher.js';

/** Synthetic, test-only keys. */
const KEY_V1 = Buffer.alloc(32, 0x11);
const KEY_V2 = Buffer.alloc(32, 0x22);
const PLAINTEXT = 'secret';

const ringV1 = () => new AesGcmCipher({ currentKeyVersion: 1, keys: new Map([[1, KEY_V1]]) });

function flipByte(buffer: Buffer, index: number): Buffer {
  const copy = Buffer.from(buffer);
  copy[index] = (copy[index] ?? 0) ^ 0x01;
  return copy;
}

describe('AesGcmCipher', () => {
  it('encrypts with a random IV and decrypts back (AC5)', () => {
    const cipher = ringV1();
    const a = cipher.encrypt(PLAINTEXT);
    const b = cipher.encrypt(PLAINTEXT);

    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.ciphertext.subarray(0, IV_BYTES).equals(b.ciphertext.subarray(0, IV_BYTES))).toBe(
      false,
    );
    expect(a.keyVersion).toBe(1);
    expect(cipher.decrypt(a.ciphertext, a.keyVersion)).toBe(PLAINTEXT);
    expect(cipher.decrypt(b.ciphertext, b.keyVersion)).toBe(PLAINTEXT);
  });

  it('stores iv ‖ ciphertext ‖ tag and never the plaintext bytes', () => {
    const { ciphertext } = ringV1().encrypt(PLAINTEXT);
    expect(ciphertext.length).toBe(IV_BYTES + Buffer.byteLength(PLAINTEXT) + AUTH_TAG_BYTES);
    expect(ciphertext.includes(Buffer.from(PLAINTEXT))).toBe(false);
  });

  it('round-trips empty, unicode and long values', () => {
    const cipher = ringV1();
    for (const value of ['', 'pässwörd 🔐 秘密', 'x'.repeat(100_000)]) {
      const encrypted = cipher.encrypt(value);
      expect(cipher.decrypt(encrypted.ciphertext, encrypted.keyVersion)).toBe(value);
    }
  });

  it('throws when any byte of the IV, body or tag is modified (AC5)', () => {
    const cipher = ringV1();
    const { ciphertext } = cipher.encrypt(PLAINTEXT);
    for (const index of [0, IV_BYTES - 1, IV_BYTES, ciphertext.length - 1]) {
      expect(() => cipher.decrypt(flipByte(ciphertext, index), 1)).toThrow(DecryptionError);
    }
  });

  it('throws on truncated input, an unknown key version or the wrong key', () => {
    const cipher = ringV1();
    const { ciphertext } = cipher.encrypt(PLAINTEXT);
    expect(() => cipher.decrypt(ciphertext.subarray(0, IV_BYTES + AUTH_TAG_BYTES - 1), 1)).toThrow(
      DecryptionError,
    );
    expect(() => cipher.decrypt(ciphertext, 2)).toThrow(DecryptionError);

    const otherKey = new AesGcmCipher({ currentKeyVersion: 1, keys: new Map([[1, KEY_V2]]) });
    expect(() => otherKey.decrypt(ciphertext, 1)).toThrow(DecryptionError);
  });

  it('decrypts version-1 data after rotating to version 2 and encrypts with version 2 (AC6)', () => {
    const before = ringV1().encrypt(PLAINTEXT);

    const rotated = new AesGcmCipher({
      currentKeyVersion: 2,
      keys: new Map([
        [1, KEY_V1],
        [2, KEY_V2],
      ]),
    });
    expect(rotated.decrypt(before.ciphertext, before.keyVersion)).toBe(PLAINTEXT);

    const after = rotated.encrypt(PLAINTEXT);
    expect(after.keyVersion).toBe(2);
    expect(rotated.decrypt(after.ciphertext, 2)).toBe(PLAINTEXT);
    // Version 1 alone cannot read version-2 data.
    expect(() => ringV1().decrypt(after.ciphertext, 2)).toThrow(DecryptionError);
  });

  it('rejects an invalid key ring', () => {
    expect(() => new AesGcmCipher({ currentKeyVersion: 2, keys: new Map([[1, KEY_V1]]) })).toThrow(
      /current key version/,
    );
    expect(
      () => new AesGcmCipher({ currentKeyVersion: 1, keys: new Map([[1, Buffer.alloc(16)]]) }),
    ).toThrow(/32 bytes/);
    expect(() => new AesGcmCipher({ currentKeyVersion: 0, keys: new Map([[0, KEY_V1]]) })).toThrow(
      /key version/,
    );
  });

  it('copies the keys, so later changes to the caller buffer do not affect it', () => {
    const key = Buffer.from(KEY_V1);
    const cipher = new AesGcmCipher({ currentKeyVersion: 1, keys: new Map([[1, key]]) });
    const { ciphertext } = cipher.encrypt(PLAINTEXT);
    key.fill(0);
    expect(cipher.decrypt(ciphertext, 1)).toBe(PLAINTEXT);
  });
});

describe('redaction: plaintext, keys and ciphertext never reach logs or messages', () => {
  const keyEncodings = [
    KEY_V1.toString('base64'),
    KEY_V1.toString('hex'),
    KEY_V1.toString('latin1'),
  ];

  it('serialises the key ring to versions only (JSON, inspect, pino)', () => {
    const cipher = ringV1();
    const logs = captureLogs();
    const logger = createLogger({ level: 'debug' }, logs.stream);
    logger.info({ cipher }, 'cipher ready');

    const summaries = [JSON.stringify(cipher), inspect(cipher, { depth: 5, showHidden: true })];
    for (const output of [...summaries, logs.text()]) {
      for (const encoded of keyEncodings) expect(output).not.toContain(encoded);
    }
    for (const output of summaries) expect(output).toContain('currentKeyVersion');
    expect(JSON.parse(JSON.stringify(cipher))).toEqual({ currentKeyVersion: 1, keyVersions: [1] });
  });

  it('redacts encrypt inputs and outputs logged under their conventional keys', () => {
    const logs = captureLogs();
    const logger = createLogger({ level: 'debug' }, logs.stream);
    const encrypted = ringV1().encrypt('plain-value-r4');
    logger.info(
      {
        plaintext: 'plain-value-r4',
        ciphertext: encrypted.ciphertext.toString('base64'),
        encryptionKey: KEY_V1.toString('base64'),
        nested: { plaintext: 'plain-value-r4', apiKey: 'api-key-value-r4' },
      },
      'encrypting',
    );
    const text = logs.text();
    for (const value of [
      'plain-value-r4',
      'api-key-value-r4',
      encrypted.ciphertext.toString('base64'),
      ...keyEncodings,
    ]) {
      expect(text).not.toContain(value);
    }
    expect(logs.lines[0]).toMatchObject({ plaintext: REDACTED, nested: { plaintext: REDACTED } });
  });

  it('throws generic errors that quote neither the input nor the key', () => {
    const cipher = ringV1();
    const { ciphertext } = cipher.encrypt('plain-value-r5');
    let error: unknown;
    try {
      cipher.decrypt(flipByte(ciphertext, ciphertext.length - 1), 1);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DecryptionError);
    const logs = captureLogs();
    createLogger({ level: 'debug' }, logs.stream).error({ err: error }, 'decrypt failed');
    const text = `${String(error)} ${logs.text()}`;
    expect(text).toContain('Decryption failed');
    for (const value of ['plain-value-r5', ciphertext.toString('base64'), ...keyEncodings]) {
      expect(text).not.toContain(value);
    }
    expect((error as Error).cause).toBeUndefined();
  });
});
