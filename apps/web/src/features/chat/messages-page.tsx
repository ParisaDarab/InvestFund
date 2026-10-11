'use client';

import { useTranslations } from 'next-intl';

import { ChatWindow } from './chat-window';
import { ConversationList } from './conversation-list';

import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/i18n/navigation';

export function MessagesPage({ id }: { id?: string }) {
  const t = useTranslations('chat');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className={id === undefined ? 'block' : 'hidden lg:block'}>
          <ConversationList {...(id === undefined ? {} : { activeId: id })} />
        </div>
        {id === undefined ? (
          <p className="type-meta hidden rounded-lg border border-dashed border-border p-10 text-center lg:block">
            {t('select')}
          </p>
        ) : (
          <div className="min-w-0 space-y-3">
            <Link href="/app/messages" className="type-meta lg:hidden">
              {t('backToList')}
            </Link>
            <ChatWindow key={id} id={id} />
          </div>
        )}
      </div>
    </div>
  );
}
