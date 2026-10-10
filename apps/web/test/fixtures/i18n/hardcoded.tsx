// Fixture for test/i18n-lint.test.ts: every element below contains hard-coded copy.
export function HardCoded() {
  return (
    <section title="Section title">
      <h1>Welcome to InvestFund</h1>
      <p>{'Raise your round'}</p>
      <p>{`Template copy`}</p>
      <img src="/x.png" alt="A chart" />
      <input aria-label={'Search'} />
    </section>
  );
}
