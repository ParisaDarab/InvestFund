import { RoleGate } from '@/components/shell/app-shell';
import { MessagesPage } from '@/features/chat/messages-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RoleGate roles={['founder', 'supporter']}>
      <MessagesPage id={id} />
    </RoleGate>
  );
}
