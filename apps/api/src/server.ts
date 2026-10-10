/**
 * HTTP entry point: validate config, build the container and app, listen, and shut down
 * gracefully on SIGTERM/SIGINT (in-flight requests complete; exit 0 when drained in time).
 */
import { createApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './core/config/config.js';
import { createContainer } from './core/container.js';
import { shutdownGracefully, startHttpServer } from './core/http/lifecycle.js';
import { createMetricsApp } from './core/metrics/metrics.js';

import type { Server } from 'node:http';

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      // Names only, never values (ConfigError guarantees this).
      process.stderr.write(`api: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const config = loadConfigOrExit();
  const container = createContainer(config);
  const { logger } = container;

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
  });

  container.startBackgroundJobs();
  const servers: Server[] = [];
  const api = await startHttpServer(
    createApp(container.appDeps()),
    config.http.host,
    config.http.port,
  );
  servers.push(api.server);
  logger.info({ host: config.http.host, port: api.port }, 'api listening');

  if (container.metrics !== undefined) {
    const metrics = await startHttpServer(
      createMetricsApp(container.metrics.registry),
      config.metrics.host,
      config.metrics.port,
    );
    servers.push(metrics.server);
    logger.info({ host: config.metrics.host, port: metrics.port }, 'metrics listening (internal)');
  }

  let shuttingDown = false;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown started');
    // Long-lived SSE streams would hold the drain open: end them first (clients reconnect).
    container.moduleContext.realtimeHub.close();
    void shutdownGracefully({
      servers,
      timeoutMs: config.shutdown.timeoutMs,
      logger,
      hooks: container.closeHooks,
    }).then(({ timedOut, hookFailures }) => {
      const clean = !timedOut && hookFailures === 0;
      logger.info({ timedOut, hookFailures }, 'shutdown complete');
      process.exit(clean ? 0 : 1);
    });
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`api: failed to start\n${message}\n`);
  process.exit(1);
});
