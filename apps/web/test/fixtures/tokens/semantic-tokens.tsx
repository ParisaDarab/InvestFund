// Fixture for test/tokens-lint.test.ts: only semantic tokens and look-alikes; must pass the guard.
export function SemanticTokens({ id }: { id: string }) {
  return (
    <div className="bg-background text-foreground border-border hover:bg-primary/90 p-4" id={id}>
      <a href="#main" className="text-muted-foreground ring-ring ring-offset-background">
        {id}
      </a>
      <a href="#deadbeef-section" className="bg-card text-primary-foreground shadow-glow" />
      <span className="text-whitespace-ok inline-block bg-transparent text-sm" />
    </div>
  );
}
