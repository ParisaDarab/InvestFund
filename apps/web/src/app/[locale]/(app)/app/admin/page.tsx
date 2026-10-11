import { RoleGate } from '@/components/shell/app-shell';
import { AdminOverview } from '@/features/admin/admin-pages';

export default function Page() {
  return (
    <RoleGate roles={['admin']}>
      <AdminOverview />
    </RoleGate>
  );
}
