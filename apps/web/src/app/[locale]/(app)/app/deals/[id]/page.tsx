import { RoleGate } from '@/components/shell/app-shell';
import { DealDetail } from '@/features/deals/deal-detail';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RoleGate roles={['founder', 'supporter']}>
      <DealDetail id={id} />
    </RoleGate>
  );
}
