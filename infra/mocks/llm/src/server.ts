import { createMockLlm } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.env);
const mock = createMockLlm(config);

const server = mock.app.listen(config.port, config.host, (error) => {
  if (error !== undefined) {
    console.error('mock-llm: failed to start', error);
    process.exit(1);
  }
  console.log(`mock-llm: listening on http://${config.host}:${String(config.port)}`);
});

function shutdown(signal: string): void {
  console.log(`mock-llm: ${signal} received, shutting down`);
  mock.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
