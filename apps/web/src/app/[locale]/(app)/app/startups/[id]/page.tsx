import { RoleGate } from '@/components/shell/app-shell';
import { StartupEditor } from '@/features/startups/startup-editor';

export default async function EditStartupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RoleGate roles={['founder']}>
      <StartupEditor id={id} />
    </RoleGate>
  );
}
