/**
 * `StorageProvider` on the local filesystem, rooted at `STORAGE_DIR` (a Docker volume in the
 * sandbox). Swappable for an S3 provider later without changing callers.
 *
 * - Keys are generated: `<last 2 hex chars of a UUID v7>/<UUID v7>` (256 shard directories).
 *   Any key that does not have exactly that shape is rejected before the filesystem is touched,
 *   and the resolved path must still lie inside the root, so `../../etc/passwd` or an absolute
 *   path can never be read, written or deleted.
 * - Uploads stream into `<root>/.tmp/<id>.part` (created exclusively, mode 0600) while counting
 *   bytes. Passing the limit aborts the stream and deletes the partial file; only a complete
 *   upload is renamed (atomically, same filesystem) to its final key.
 */
import { constants } from 'node:fs';
import { access, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { Transform, type Readable, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { NotFoundError, PayloadTooLargeError } from '../errors/domain-errors.js';
import { newId } from '../ids/uuid-v7.js';

import type { PutOptions, StorageProvider, StoredObject } from './storage-provider.js';

const KEY_PATTERN =
  /^([0-9a-f]{2})\/([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const TMP_DIR = '.tmp';

/** The key is not one this provider could have generated: a programming or data error (500). */
export class InvalidStorageKeyError extends Error {
  override readonly name = 'InvalidStorageKeyError';

  constructor() {
    super('Invalid storage key');
  }
}

export class StorageObjectNotFoundError extends NotFoundError {
  constructor() {
    super('The file was not found.');
  }
}

export interface LocalDiskStorageOptions {
  /** Root directory (`config.storage.dir`). */
  readonly rootDir: string;
  /** Upload limit in bytes (`config.storage.maxUploadBytes`). */
  readonly maxBytes: number;
}

/** Counts bytes and fails the pipeline as soon as `limit` is exceeded. */
class SizeLimit extends Transform {
  bytes = 0;

  constructor(private readonly limit: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.limit) {
      callback(new PayloadTooLargeError('The file is larger than the upload limit.'));
      return;
    }
    callback(null, chunk);
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

export class LocalDiskStorageProvider implements StorageProvider {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(options: LocalDiskStorageOptions) {
    if (!Number.isInteger(options.maxBytes) || options.maxBytes < 1) {
      throw new Error('maxBytes must be a positive integer');
    }
    this.root = resolve(options.rootDir);
    this.maxBytes = options.maxBytes;
  }

  /** Creates the root and temp directories (mode 0700) when missing. Idempotent. */
  async ensureRoot(): Promise<void> {
    await mkdir(join(this.root, TMP_DIR), { recursive: true, mode: 0o700 });
  }

  /** Readiness probe: the root exists, is a directory and is writable by this process. */
  async checkWritable(): Promise<void> {
    await this.ensureRoot();
    if (!(await stat(this.root)).isDirectory()) throw new Error('storage root is not a directory');
    await access(this.root, constants.W_OK);
  }

  async put(body: Readable, options: PutOptions = {}): Promise<StoredObject> {
    const limit = Math.min(options.maxBytes ?? this.maxBytes, this.maxBytes);
    const id = newId();
    const shard = id.slice(-2);
    await this.ensureRoot();

    const tmpPath = join(this.root, TMP_DIR, `${id}.part`);
    const handle = await open(tmpPath, 'wx', 0o600);
    const counter = new SizeLimit(limit);
    try {
      // The write stream closes the handle when it finishes or is destroyed.
      await pipeline(body, counter, handle.createWriteStream());
      await mkdir(join(this.root, shard), { recursive: true, mode: 0o700 });
      await rename(tmpPath, join(this.root, shard, id));
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(tmpPath, { force: true });
      throw error;
    }
    return { key: `${shard}/${id}`, sizeBytes: counter.bytes };
  }

  async get(key: string): Promise<Readable> {
    const path = this.pathOf(key);
    try {
      const handle = await open(path, 'r');
      return handle.createReadStream();
    } catch (error) {
      if (isMissing(error)) throw new StorageObjectNotFoundError();
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const path = this.pathOf(key);
    try {
      return (await stat(path)).isFile();
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  /** Validates the key shape, then confirms that the resolved path stays inside the root. */
  private pathOf(key: string): string {
    const match = KEY_PATTERN.exec(key);
    if (match?.[2] === undefined || match[1] !== match[2].slice(-2)) {
      throw new InvalidStorageKeyError();
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new InvalidStorageKeyError();
    return path;
  }
}
