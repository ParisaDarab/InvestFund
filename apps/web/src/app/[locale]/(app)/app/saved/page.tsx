import { RoleGate } from '@/components/shell/app-shell';
import { Saved } from '@/features/discovery/supporter-pages';

export default function Page() {
  return (
    <RoleGate roles={['supporter']}>
      <Saved />
    </RoleGate>
  );
}
