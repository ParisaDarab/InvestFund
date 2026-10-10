// Removes dist/ before a build so that deleted sources never leave stale output behind.
import { rmSync } from 'node:fs';

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
