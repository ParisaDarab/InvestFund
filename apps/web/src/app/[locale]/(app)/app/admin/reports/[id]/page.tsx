import { RoleGate } from '@/components/shell/app-shell';
import { AdminReportDetail } from '@/features/admin/admin-pages';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RoleGate roles={['admin']}>
      <AdminReportDetail id={id} />
    </RoleGate>
  );
}
