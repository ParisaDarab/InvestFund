import { RoleGate } from '@/components/shell/app-shell';
import { ConnectionsPage } from '@/features/connections/connections-page';

export default function Page() {
  return (
    <RoleGate roles={['founder', 'supporter']}>
      <ConnectionsPage />
    </RoleGate>
  );
}
