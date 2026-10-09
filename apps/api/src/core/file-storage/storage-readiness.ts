/** `storage` readiness check for `GET /health/ready`: the storage root is writable. */
import type { ReadinessCheck } from '../health/health-registry.js';

export const STORAGE_CHECK_NAME = 'storage';

export interface WritableProbe {
  checkWritable(): Promise<void>;
}

export function createStorageReadinessCheck(storage: WritableProbe): ReadinessCheck {
  return {
    name: STORAGE_CHECK_NAME,
    run: () => storage.checkWritable(),
  };
}
