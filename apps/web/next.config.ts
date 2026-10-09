import path from 'node:path';

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';

import { parsePublicEnv } from './src/lib/env';
import { buildSecurityHeaders } from './src/lib/security-headers';

import type { NextConfig } from 'next';

/**
 * next-intl request config. This is what `createNextIntlPlugin()` from `next-intl/plugin` wires
 * up; we set the alias directly because that plugin eagerly loads `@swc/core` (for its optional
 * message extractor), whose native binding cannot load on some Windows hosts. Keep this in sync
 * with next-intl's `getNextConfig` when upgrading next-intl.
 */
const I18N_REQUEST_CONFIG = './src/i18n/request.ts';

export default function nextConfig(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  // Fail fast (naming the variable) when `next build` or `next dev` runs without the public env.
  // Other phases (`next start`, `next typegen`) do not need it.
  const env = isDev || phase === PHASE_PRODUCTION_BUILD ? parsePublicEnv(process.env) : undefined;

  return {
    reactStrictMode: true,
    poweredByHeader: false,
    turbopack: {
      resolveAlias: { 'next-intl/config': I18N_REQUEST_CONFIG },
    },
    webpack(config: { context: string; resolve: { alias: Record<string, string> } }) {
      // Only used with `next build --webpack`; Turbopack is the default bundler.
      config.resolve.alias['next-intl/config'] = path.resolve(config.context, I18N_REQUEST_CONFIG);
      return config;
    },
    headers() {
      return Promise.resolve([
        {
          source: '/:path*',
          headers: buildSecurityHeaders({ apiUrl: env?.NEXT_PUBLIC_API_URL, isDev }),
        },
      ]);
    },
  };
}
