import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MessageBubble from '../components/MessageBubble.jsx';
import { Btn, Empty, ErrorBox, Field, Loading } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useMessageSearch } from '../hooks/useMessageSearch.js';
import { api, errMsg } from '../services/api.js';

export default function Sent() {
  const { user } = useAuth();
  const ui = useUI();
  const [messages, setMessages] = useState(null);
  const [peers, setPeers] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [hideToken, setHideToken] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/messages/sent?limit=30');
      setMessages(r.messages);
      setPeers(r.peers);
      setHasMore(r.hasMore);
      setError('');
    } catch (e) {
      setError(errMsg(e));
      setMessages((m) => m ?? []);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    setMore(true);
    try {
      const last = messages[messages.length - 1];
      const r = await api.get(`/messages/sent?limit=30&before=${encodeURIComponent(last.createdAt)}`);
      setMessages((l) => [...l, ...r.messages]);
      setPeers((p) => ({ ...p, ...r.peers }));
      setHasMore(r.hasMore);
    } catch (e) {
      ui.toast(errMsg(e), 'error');
    } finally {
      setMore(false);
    }
  };

  const peerFor = useCallback((m) => peers[m.recipientId], [peers]);
  const search = useMessageSearch({ messages, me: user, peerFor, enabled: true });
  const shown = search.shown || [];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 p-1.5 flex-wrap" style={{ boxShadow: '0 1px 0 var(--lo), 0 2px 0 var(--hi)' }}>
        <span className="font-bold">SENT MESSAGES</span>
        <label htmlFor="sent-find" className="sr-only">
          Search sent messages
        </label>
        <Field id="sent-find" className="flex-1 min-w-[140px] max-w-sm" placeholder="search sent messages (local, results stay encrypted)" value={search.q} onChange={(e) => search.setQ(e.target.value)} />
        <span className="dim">{search.locked ? 'UNLOCK KEYS TO SEARCH' : search.busy ? 'INDEXING...' : search.active ? `${shown.length} MATCHES` : ''}</span>
        <Btn size="sm" icon="lock" onClick={() => setHideToken((t) => t + 1)}>
          HIDE ALL
        </Btn>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2 flex flex-col gap-2" style={{ background: 'var(--bg)' }}>
        {messages === null ? (
          <Loading label="LOADING SENT MESSAGES" />
        ) : (
          <>
            {error && <ErrorBox onRetry={load} title="COULD NOT LOAD">{error}</ErrorBox>}
            {messages.length === 0 && !error && (
              <Empty icon="sent" title="NOTHING SENT YET">
                Messages you send appear here, still encrypted. You can decrypt your own sent messages.
                <div className="mt-2">
                  <Link to="/new" className="link">
                    Start a conversation
                  </Link>
                </div>
              </Empty>
            )}
            {search.active && shown.length === 0 && messages.length > 0 && !search.busy && <Empty icon="folder" title="NO MATCHES" />}
            {shown.map((m) => (
              <MessageBubble key={m.id} message={m} mine peer={peers[m.recipientId]} hideToken={hideToken} marked={search.active} />
            ))}
            {hasMore && !search.active && (
              <div className="text-center">
                <Btn size="sm" onClick={loadMore} disabled={more}>
                  {more ? 'LOADING...' : '▼ LOAD MORE'}
                </Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
