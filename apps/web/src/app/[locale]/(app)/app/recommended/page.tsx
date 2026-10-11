import { RoleGate } from '@/components/shell/app-shell';
import { Recommended } from '@/features/discovery/supporter-pages';

export default function Page() {
  return (
    <RoleGate roles={['supporter']}>
      <Recommended />
    </RoleGate>
  );
}
