import { RoleGate } from '@/components/shell/app-shell';
import { MyStartups } from '@/features/startups/my-startups';

export default function MyStartupsPage() {
  return (
    <RoleGate roles={['founder']}>
      <MyStartups />
    </RoleGate>
  );
}
