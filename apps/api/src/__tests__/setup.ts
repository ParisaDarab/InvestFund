/** Vitest setup for the api project: release database connections opened by test apps. */
import { afterAll } from 'vitest';

import { closeTestApps } from './support.js';

afterAll(closeTestApps);
