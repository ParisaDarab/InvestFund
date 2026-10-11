import type { ReactNode } from 'react';

/** Simple long-form page layout for informational and legal pages. */
export function ProsePage({
  title,
  intro,
  notice,
  children,
}: {
  title: string;
  intro?: string;
  notice?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-14 sm:px-6">
      <header className="space-y-3">
        <h1 className="type-h1 text-4xl">{title}</h1>
        {intro === undefined ? null : <p className="text-muted-foreground text-lg">{intro}</p>}
      </header>
      {notice === undefined ? null : (
        <p
          role="note"
          className="border-warning/40 text-warning rounded-md border p-4 text-sm font-medium"
        >
          {notice}
        </p>
      )}
      <div className="space-y-8">{children}</div>
    </main>
  );
}

export function ProseSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2">
      <h2 className="type-h3">{title}</h2>
      <p className="leading-7 whitespace-pre-line">{body}</p>
    </section>
  );
}
