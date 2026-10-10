/** Local-disk storage provider against a temporary directory (AC7, AC8). */
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PayloadTooLargeError } from '../../errors/domain-errors.js';
import {
  InvalidStorageKeyError,
  LocalDiskStorageProvider,
  StorageObjectNotFoundError,
} from '../local-disk-storage.js';
import { createStorageReadinessCheck, STORAGE_CHECK_NAME } from '../storage-readiness.js';

const KEY_SHAPE =
  /^([0-9a-f]{2})\/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{10}\1$/;

let base: string;
let root: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'investfund-files-test-'));
  root = join(base, 'root');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function provider(maxBytes = 1024): LocalDiskStorageProvider {
  return new LocalDiskStorageProvider({ rootDir: root, maxBytes });
}

/** Every file under the root, relative (shows leftovers such as `.tmp/*.part`). */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

/** A stream of `total` bytes in `chunkSize` chunks. */
function bytes(total: number, chunkSize = 100): Readable {
  let sent = 0;
  return new Readable({
    read() {
      if (sent >= total) {
        this.push(null);
        return;
      }
      const size = Math.min(chunkSize, total - sent);
      sent += size;
      this.push(Buffer.alloc(size, 0x61));
    },
  });
}

describe('LocalDiskStorageProvider', () => {
  it('stores a stream under a generated key and reads it back', async () => {
    const storage = provider();
    const stored = await storage.put(Readable.from([Buffer.from('hello '), Buffer.from('world')]));

    expect(stored.key).toMatch(KEY_SHAPE);
    expect(stored.sizeBytes).toBe(11);
    expect(await storage.exists(stored.key)).toBe(true);
    expect(await text(await storage.get(stored.key))).toBe('hello world');
    expect(await filesUnder(join(root, '.tmp'))).toEqual([]);
  });

  it('generates a distinct key per upload', async () => {
    const storage = provider();
    const a = await storage.put(Readable.from([Buffer.from('a')]));
    const b = await storage.put(Readable.from([Buffer.from('a')]));
    expect(a.key).not.toBe(b.key);
  });

  it('accepts a stream of exactly the limit', async () => {
    const stored = await provider(1000).put(bytes(1000));
    expect(stored.sizeBytes).toBe(1000);
  });

  it('aborts a stream larger than the limit with payload-too-large and leaves no file (AC7)', async () => {
    const storage = provider(1000);
    const source = bytes(5000);
    const error = await storage.put(source).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PayloadTooLargeError);
    expect((error as PayloadTooLargeError).slug).toBe('payload-too-large');
    expect((error as PayloadTooLargeError).status).toBe(413);
    expect(source.destroyed).toBe(true);
    expect(await filesUnder(root)).toEqual([]);
  });

  it('applies a smaller per-call limit but never a larger one', async () => {
    const storage = provider(1000);
    await expect(storage.put(bytes(600), { maxBytes: 500 })).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
    await expect(storage.put(bytes(1500), { maxBytes: 10_000 })).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
    expect(await filesUnder(root)).toEqual([]);
  });

  it('removes the partial file when the source stream fails', async () => {
    const source = new Readable({
      read() {
        this.push(Buffer.from('partial'));
        this.destroy(new Error('client disconnected'));
      },
    });
    await expect(provider().put(source)).rejects.toThrow('client disconnected');
    expect(await filesUnder(root)).toEqual([]);
  });

  it('rejects traversal and malformed keys without reading outside the root (AC8)', async () => {
    const storage = provider();
    await writeFile(join(base, 'outside.txt'), 'outside-secret');
    const stored = await storage.put(Readable.from([Buffer.from('x')]));
    const id = stored.key.split('/')[1] ?? '';
    const wrongShard = id.endsWith('00') ? '01' : '00';

    const malicious = [
      '../../etc/passwd',
      '../outside.txt',
      '/etc/passwd',
      join(base, 'outside.txt'),
      `${stored.key}/../../outside.txt`,
      `../root/${stored.key}`,
      id, // missing shard
      `${wrongShard}/${id}`,
      stored.key.toUpperCase(),
      `${stored.key}\0`,
      '',
    ];
    for (const key of malicious) {
      await expect(storage.get(key), key).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.exists(key), key).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.delete(key), key).rejects.toBeInstanceOf(InvalidStorageKeyError);
    }
    // Nothing was deleted on the way.
    expect(await storage.exists(stored.key)).toBe(true);
  });

  it('reports a missing object as not found, and delete is idempotent', async () => {
    const storage = provider();
    const stored = await storage.put(Readable.from([Buffer.from('x')]));
    await storage.delete(stored.key);
    await storage.delete(stored.key);

    expect(await storage.exists(stored.key)).toBe(false);
    await expect(storage.get(stored.key)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it('rejects a non-positive limit', () => {
    expect(() => provider(0)).toThrow(/maxBytes/);
  });
});

describe('storage readiness check', () => {
  it('passes when the root can be created and written', async () => {
    const check = createStorageReadinessCheck(provider());
    expect(check.name).toBe(STORAGE_CHECK_NAME);
    await expect(check.run(new AbortController().signal)).resolves.toBeUndefined();
  });

  it('fails when the root path is a file', async () => {
    await writeFile(root, 'not a directory');
    const check = createStorageReadinessCheck(provider());
    await expect(check.run(new AbortController().signal)).rejects.toThrow();
  });
});
