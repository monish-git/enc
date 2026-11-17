import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PixelIcon from '../components/PixelIcon.jsx';
import { Btn, Empty, ErrorBox, Field, Lamp, Loading } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { api, errMsg } from '../services/api.js';

export default function NewConversation() {
  const data = useData();
  const ui = useUI();
  const nav = useNavigate();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    data.refreshContacts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data.contacts?.contacts || []).filter((c) => !f || c.user.username.includes(f));
  }, [data.contacts, filter]);

  const start = async (u) => {
    setBusy(u.id);
    try {
      const { conversation } = await api.post('/conversations', { userId: u.id });
      data.refreshConversations();
      nav(`/inbox/${conversation.id}`);
    } catch (e) {
      ui.toast(errMsg(e), 'error');
      setBusy('');
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 gap-2">
      <div className="flex items-center gap-2">
        <PixelIcon name="newchat" size={24} />
        <div>
          <div className="font-bold text-[13px]">NEW CONVERSATION</div>
          <div className="dim">Choose a contact to start an end-to-end encrypted conversation.</div>
        </div>
      </div>
      <label htmlFor="nc-f" className="sr-only">
        Filter contacts
      </label>
      <Field id="nc-f" placeholder="filter contacts..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />
      <div className="list flex-1 min-h-0">
        {data.contacts === null ? (
          <Loading label="LOADING CONTACTS" />
        ) : data.errors.contacts && !data.contacts.contacts.length ? (
          <ErrorBox onRetry={data.refreshContacts}>{data.errors.contacts}</ErrorBox>
        ) : list.length === 0 ? (
          <Empty icon="contacts" title={filter ? 'NO MATCHES' : 'NO CONTACTS TO MESSAGE'}>
            {!filter && (
              <>
                You can only message accepted contacts.
                <div className="mt-2">
                  <Btn onClick={() => nav('/contacts?tab=find')}>FIND USERS</Btn>
                </div>
              </>
            )}
          </Empty>
        ) : (
          list.map((c) => (
            <div key={c.id} className="row">
              <PixelIcon name="user" size={20} />
              <Lamp state={data.peerOnline(c.user) ? 'on' : 'off'} label={data.peerOnline(c.user) ? 'online' : 'offline'} />
              <span className="flex-1 font-bold truncate">{c.user.username.toUpperCase()}</span>
              <Btn size="sm" variant="primary" onClick={() => start(c.user)} disabled={busy === c.user.id}>
                {busy === c.user.id ? 'OPENING...' : 'START'}
              </Btn>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
