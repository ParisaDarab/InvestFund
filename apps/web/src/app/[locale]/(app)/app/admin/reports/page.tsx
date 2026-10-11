import { RoleGate } from '@/components/shell/app-shell';
import { AdminReports } from '@/features/admin/admin-pages';

export default function Page() {
  return (
    <RoleGate roles={['admin']}>
      <AdminReports />
    </RoleGate>
  );
}
