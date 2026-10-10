/**
 * Isolated PostgreSQL databases for integration tests.
 *
 * `createTestDatabase()` creates a uniquely named database on a test server, applies the Prisma
 * migrations to it (`prisma migrate deploy`) and returns its URL; `drop()` removes it. A fresh
 * database per suite (rather than a schema) means each suite also gets its own copy of the
 * `vector` and `citext` extensions, so suites can run in parallel without seeing each other's
 * data or sharing extension objects.
 *
 * Where the server comes from is behind `TestDatabaseServer`. Today it is an existing server
 * named by `TEST_DATABASE_URL` (falling back to `DATABASE_URL`, then the local compose database).
 * A Testcontainers-backed server (`pgvector/pgvector` PG 16) can be added later as another
 * `TestDatabaseServer` without changing callers (deferred to P0-TEST-01 / P0-CI-01).
 *
 * SQL runs through the Prisma CLI of the project that owns the migrations (`apps/api`), so this
 * package needs no database driver. Connection URLs are passed through the environment, never
 * on the command line, and are never included in error messages.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The local compose database (infra/docker-compose.yml defaults). */
export const DEFAULT_TEST_SERVER_URL =
  'postgresql://investfund:investfund@localhost:5432/investfund';

const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const PRISMA_TIMEOUT_MS = 60_000;

type Env = Readonly<Record<string, string | undefined>>;

/** `TEST_DATABASE_URL`, else `DATABASE_URL`, else the local compose database. */
export function testDatabaseServerUrl(env: Env = process.env): string {
  const set = (value: string | undefined) => (value === '' ? undefined : value);
  return set(env.TEST_DATABASE_URL) ?? set(env.DATABASE_URL) ?? DEFAULT_TEST_SERVER_URL;
}

/** A PostgreSQL server on which test databases can be created (the role needs CREATEDB). */
export interface TestDatabaseServer {
  /** Connection URL of an existing database on the server, used to create and drop others. */
  readonly url: string;
  /** Releases the server (stops a container). A no-op for an existing server. */
  release(): Promise<void>;
}

/** An already running server, for example the compose `postgres` service or a CI service. */
export function existingServer(url: string = testDatabaseServerUrl()): TestDatabaseServer {
  return { url, release: () => Promise.resolve() };
}

export interface TestDatabaseOptions {
  /** Directory of the project that owns `prisma.config.ts` and the migrations (`apps/api`). */
  readonly prismaProjectDir: string;
  /** Defaults to `existingServer()`. */
  readonly server?: TestDatabaseServer;
  /** Database name prefix (lower-case letters, digits and `_`). Defaults to `test`. */
  readonly prefix?: string;
  /** Apply the migrations after creating the database. Defaults to `true`. */
  readonly migrate?: boolean;
}

export interface TestDatabase {
  /** Connection URL of the isolated database. */
  readonly url: string;
  /** Its database name. */
  readonly name: string;
  /** Drops the database (terminating open connections). Safe to call more than once. */
  drop(): Promise<void>;
}

/** Replaces the database in `serverUrl` with `name` and drops any `schema` parameter. */
export function databaseUrl(serverUrl: string, name: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  url.searchParams.delete('schema');
  return url.toString();
}

/** A unique, valid database name such as `test_m1abc2_9f8e7d6c`. */
export function uniqueDatabaseName(prefix = 'test'): string {
  const name = `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  if (!DATABASE_NAME.test(name)) throw new Error('Invalid test database prefix');
  return name;
}

export async function createTestDatabase(options: TestDatabaseOptions): Promise<TestDatabase> {
  const server = options.server ?? existingServer();
  const prisma = prismaCli(options.prismaProjectDir);
  const name = uniqueDatabaseName(options.prefix);
  const url = databaseUrl(server.url, name);

  // The name is generated and validated above; identifiers cannot be bound as parameters.
  await prisma.execute(server.url, `CREATE DATABASE "${name}"`);
  let dropped = false;
  const drop = async (): Promise<void> => {
    if (dropped) return;
    dropped = true;
    await prisma.execute(server.url, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  };

  if (options.migrate ?? true) {
    try {
      await prisma.run(['migrate', 'deploy'], url);
    } catch (error) {
      await drop();
      throw error;
    }
  }
  return { url, name, drop };
}

interface PrismaCli {
  run(args: readonly string[], databaseUrl: string, stdin?: string): Promise<void>;
  execute(databaseUrl: string, sql: string): Promise<void>;
}

function prismaCli(projectDir: string): PrismaCli {
  const entry = join(projectDir, 'node_modules', 'prisma', 'build', 'index.js');
  if (!existsSync(entry)) {
    throw new Error(`Prisma CLI not found in ${projectDir} (run pnpm install)`);
  }
  const run = (args: readonly string[], databaseUrl: string, stdin?: string) =>
    new Promise<void>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [entry, ...args],
        {
          cwd: projectDir,
          env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
          timeout: PRISMA_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, _stdout, stderr) => {
          if (error === null) {
            resolve();
            return;
          }
          // Only the subcommand and Prisma's stderr: never the environment or the URL.
          const detail = stderr.split(databaseUrl).join('[database-url]').trim();
          reject(new Error(`prisma ${args.slice(0, 2).join(' ')} failed: ${detail}`));
        },
      );
      child.stdin?.end(stdin ?? '');
    });
  return {
    run,
    execute: (databaseUrl, sql) =>
      run(['db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'], databaseUrl, sql),
  };
}
