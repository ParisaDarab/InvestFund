import { createMockGoogle } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.env);
const mock = createMockGoogle(config);

const server = mock.app.listen(config.port, config.host, (error) => {
  if (error !== undefined) {
    console.error('mock-google: failed to start', error);
    process.exit(1);
  }
  console.log(`mock-google: listening on http://${config.host}:${String(config.port)}`);
});

function shutdown(signal: string): void {
  console.log(`mock-google: ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
