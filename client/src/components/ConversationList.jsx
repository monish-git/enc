import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import PixelIcon from './PixelIcon.jsx';
import { Btn, Empty, ErrorBox, Field, Lamp, Loading } from './ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { fmtShort } from '../utils/format.js';

export default function ConversationList({ title, items, error, onRetry, basePath, emptyTitle, emptyText, showNew }) {
  const nav = useNavigate();
  const { peerOnline, isTyping } = useData();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (items || []).filter((c) => !f || c.peer.username.includes(f));
  }, [items, filter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 p-1.5">
        <span className="font-bold flex-1 truncate">{title}</span>
        {showNew && (
          <Btn size="sm" icon="newchat" onClick={() => nav('/new')}>
            NEW
          </Btn>
        )}
      </div>
      <div className="px-1.5 pb-1.5">
        <label htmlFor="conv-filter" className="sr-only">
          Filter conversations
        </label>
        <Field id="conv-filter" placeholder="filter by username..." value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      <div className="list flex-1 min-h-0 mx-1.5 mb-1.5" aria-label={title}>
        {items === null ? (
          <Loading label="LOADING CONVERSATIONS" />
        ) : error && items.length === 0 ? (
          <ErrorBox onRetry={onRetry} title="COULD NOT LOAD">
            {error}
          </ErrorBox>
        ) : filtered.length === 0 ? (
          <Empty icon="inbox" title={filter ? 'NO MATCHES' : emptyTitle}>
            {filter ? 'Try another name.' : emptyText}
          </Empty>
        ) : (
          filtered.map((c) => (
            <NavLink key={c.id} to={`${basePath}/${c.id}`} className={({ isActive }) => `row !items-start ${isActive ? 'sel' : ''}`}>
              <div className="pt-0.5">
                <PixelIcon name="user" size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Lamp state={peerOnline(c.peer) ? 'on' : 'off'} label={peerOnline(c.peer) ? 'online' : 'offline'} />
                  <span className="font-bold truncate flex-1" style={{ fontWeight: c.unread ? 700 : 400 }}>
                    {c.peer.username.toUpperCase()}
                  </span>
                  {c.lastMessage && <span className="text-[11px] opacity-80">{fmtShort(c.lastMessage.createdAt)}</span>}
                </div>
                <div className="font-mono text-[11px] truncate opacity-80">
                  {isTyping(c.id) ? 'typing...' : c.lastMessage ? `${c.lastMessage.mine ? '> ' : ''}${c.lastMessage.preview}...` : 'no messages yet'}
                </div>
              </div>
              {c.unread > 0 && <span className="badge mt-0.5">{c.unread}</span>}
            </NavLink>
          ))
        )}
      </div>
    </div>
  );
}
