import { RoleGate } from '@/components/shell/app-shell';
import { NewStartup } from '@/features/startups/my-startups';

export default function NewStartupPage() {
  return (
    <RoleGate roles={['founder']}>
      <NewStartup />
    </RoleGate>
  );
}
