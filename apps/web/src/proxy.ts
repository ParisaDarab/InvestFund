import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

// Next.js 16 renamed `middleware` to `proxy`. Adds the locale prefix (`/` -> `/en-GB`).
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next.js internals and files with an extension (static assets).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
