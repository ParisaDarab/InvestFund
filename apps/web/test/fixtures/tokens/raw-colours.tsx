// Fixture for test/tokens-lint.test.ts: every marked line uses a raw colour and must be flagged.
const accent = '#34D399'; // line 2
export function RawColours({ active }: { active: boolean }) {
  return (
    <div className="bg-zinc-900 p-4">
      <p className="hover:text-emerald-400/50">{accent}</p>
      <p style={{ color: '#fff' }} className={`border-white ${active ? 'ring-black' : ''}`} />
      <span className={`font-bold ring-offset-slate-50`} />
    </div>
  );
}
