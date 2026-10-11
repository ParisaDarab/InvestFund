import { RoleGate } from '@/components/shell/app-shell';
import { MessagesPage } from '@/features/chat/messages-page';

export default function Page() {
  return (
    <RoleGate roles={['founder', 'supporter']}>
      <MessagesPage />
    </RoleGate>
  );
}
