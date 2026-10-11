import { RoleGate } from '@/components/shell/app-shell';
import { AppDiscover } from '@/features/discovery/supporter-pages';

export default function Page() {
  return (
    <RoleGate roles={['supporter']}>
      <AppDiscover />
    </RoleGate>
  );
}
