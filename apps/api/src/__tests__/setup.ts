/**
 * Vitest setup for the api project: release database connections opened by test apps and remove
 * the file-storage directory they used.
 */
import { afterAll } from 'vitest';

import { closeTestApps, removeTestFiles } from './support.js';

afterAll(async () => {
  await closeTestApps();
  await removeTestFiles();
});
