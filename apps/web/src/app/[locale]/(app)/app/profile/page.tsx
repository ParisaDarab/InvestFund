import { RoleGate } from '@/components/shell/app-shell';
import { ProfilePage } from '@/features/settings/settings-page';

export default function Page() {
  return (
    <RoleGate roles={['founder', 'supporter']}>
      <ProfilePage />
    </RoleGate>
  );
}
