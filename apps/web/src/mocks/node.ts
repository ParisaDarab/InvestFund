import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/** MSW server for Vitest. Tests override handlers per case with `server.use(...)`. */
export const server = setupServer(...handlers);
