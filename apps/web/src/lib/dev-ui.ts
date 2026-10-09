export interface DevUiEnv {
  NODE_ENV?: string | undefined;
  INVESTFUND_DEV_UI?: string | undefined;
}

/**
 * Whether internal developer pages (the `/[locale]/dev/ui` showcase) are served. Always on in
 * `next dev`; in a production build only when `INVESTFUND_DEV_UI=true` is set at build time (for
 * the Playwright + axe run against the showcase). The pages are statically rendered, so the value
 * is fixed when the page is built.
 */
export function isDevUiEnabled(env: DevUiEnv): boolean {
  return env.NODE_ENV !== 'production' || env.INVESTFUND_DEV_UI === 'true';
}
