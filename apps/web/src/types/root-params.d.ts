// Root route params (`src/app/[locale]` is the root layout). Next.js generates the same
// declaration into .next/types/root-params.d.ts during dev/build/typegen; declaring it here keeps
// `tsc --noEmit` and type-aware lint independent of a prior Next.js run.
declare module 'next/root-params' {
  export function locale(): Promise<string>;
}
