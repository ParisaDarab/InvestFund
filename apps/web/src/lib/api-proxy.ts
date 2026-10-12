/**
 * Optional same-origin API proxy for hosts without a shared domain (for example the web app on
 * `*.vercel.app` and the API on `*.onrender.com`). The refresh cookie is `SameSite=Lax`, so the
 * browser only sends it to the API when both are on the same site. With `API_PROXY_TARGET` set,
 * Next.js forwards `/api/v1/*` to the API and `NEXT_PUBLIC_API_URL` points at the web app itself.
 *
 * `API_PROXY_TARGET` is server-only (never inlined into the browser bundle) and is read when
 * `next build` / `next start` loads the config.
 */
export interface ProxyRewrite {
  source: string;
  destination: string;
}

export class ApiProxyConfigError extends Error {
  override readonly name = 'ApiProxyConfigError';
}

export function buildApiProxyRewrites(target: string | undefined): ProxyRewrite[] {
  const value = target?.trim();
  if (value === undefined || value === '') return [];

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiProxyConfigError('API_PROXY_TARGET must be an absolute http(s) URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ApiProxyConfigError('API_PROXY_TARGET must be an absolute http(s) URL');
  }
  return [{ source: '/api/v1/:path*', destination: `${url.origin}/api/v1/:path*` }];
}
