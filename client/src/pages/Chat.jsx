import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatWindow from '../components/ChatWindow.jsx';
import ConversationList from '../components/ConversationList.jsx';
import { Empty } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';

// Inbox (and Archived): conversation list on the left, chat window on the right.
export default function Chat({ archived = false }) {
  const { id } = useParams();
  const nav = useNavigate();
  const data = useData();
  const base = archived ? '/archived' : '/inbox';
  const items = archived ? data.archived : data.conversations;
  const refresh = archived ? data.refreshArchived : data.refreshConversations;

  useEffect(() => {
    refresh();
  }, [archived]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-1 min-h-0">
      <aside className={`${id ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[270px] md:shrink-0 min-h-0`} style={{ boxShadow: 'inset -1px 0 var(--lo), inset -2px 0 var(--hi)' }}>
        <ConversationList
          title={archived ? 'ARCHIVED MESSAGES' : `INBOX${data.unread ? ` (${data.unread} UNREAD)` : ''}`}
          items={items}
          error={archived ? data.errors.archived : data.errors.conversations}
          onRetry={refresh}
          basePath={base}
          showNew={!archived}
          emptyTitle={archived ? 'NO ARCHIVED CONVERSATIONS' : 'INBOX IS EMPTY'}
          emptyText={archived ? 'Archived conversations are kept here.' : 'Add a contact, then start your first encrypted conversation.'}
        />
      </aside>
      <section className={`${id ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 min-h-0 flex-col`}>
        {id ? (
          <ChatWindow key={id} id={id} basePath={base} onBack={() => nav(base)} />
        ) : (
          <div className="m-auto">
            <Empty icon="lock" title="SELECT A CONVERSATION">
              Messages are encrypted by default. Only you decide when to reveal them.
            </Empty>
          </div>
        )}
      </section>
    </div>
  );
}
