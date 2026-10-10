import { healthHandlers } from './health';

/** Default happy-path handlers shared by the Vitest node server and the dev browser worker. */
export const handlers = [...healthHandlers];
