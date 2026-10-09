/**
 * Process-level tests of `src/server.ts`, run through tsx in a child process.
 * The SIGTERM test needs POSIX signals, so it is skipped on Windows (CI runs on Linux);
 * the in-process drain behaviour is covered by core/http/__tests__/lifecycle.int.test.ts.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function startServer(env: Record<string, string>) {
  const inherited = Object.fromEntries(
    ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]]],
    ),
  ) as Record<string, string>;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: API_ROOT,
    env: { ...inherited, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const exited = new Promise<RunResult>((resolve) => {
    child.on('exit', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
  return { child, exited, output: () => stdout };
}

describe('server entry point', () => {
  it('exits non-zero naming JWT_ACCESS_SECRET when it is unset, without printing values (AC5)', async () => {
    const { exited } = startServer({
      NODE_ENV: 'development',
      API_PORT: '0',
      METRICS_ENABLED: 'false',
      // A value that must never be echoed, next to the missing variable.
      SHUTDOWN_TIMEOUT_MS: 'not-a-number-value-xyz',
    });
    const result = await exited;

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('JWT_ACCESS_SECRET');
    expect(result.stderr).toContain('SHUTDOWN_TIMEOUT_MS');
    expect(result.stderr + result.stdout).not.toContain('not-a-number-value-xyz');
  }, 30_000);

  it.skipIf(process.platform === 'win32')(
    'shuts down with exit code 0 on SIGTERM (AC8)',
    async () => {
      const { child, exited, output } = startServer({
        NODE_ENV: 'development',
        API_PORT: '0',
        METRICS_ENABLED: 'false',
        JWT_ACCESS_SECRET: 'process-test-secret',
        // Prisma connects lazily, so the server starts without reaching the database.
        DATABASE_URL: 'postgresql://investfund:investfund@127.0.0.1:1/investfund',
      });
      const deadline = Date.now() + 20_000;
      while (!output().includes('api listening')) {
        if (Date.now() > deadline) throw new Error('server did not start');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const started = Date.now();
      child.kill('SIGTERM');
      const result = await exited;
      expect(result.code).toBe(0);
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(result.stdout).toContain('shutdown complete');
    },
    30_000,
  );
});
