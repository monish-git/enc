import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FingerprintDialog } from '../components/MessageDialogs.jsx';
import PixelIcon from '../components/PixelIcon.jsx';
import { Btn, Empty, ErrorBox, Field, Lamp, Loading, Tabs } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { api, errMsg } from '../services/api.js';
import { fmtAgo } from '../utils/format.js';

function Person({ name, sub, online, children }) {
  return (
    <div className="row !cursor-default flex-wrap" style={{ background: 'transparent', color: 'inherit' }}>
      <PixelIcon name="user" size={20} />
      <div className="flex-1 min-w-[120px]">
        <div className="font-bold flex items-center gap-1.5">
          {online !== undefined && <Lamp state={online ? 'on' : 'off'} label={online ? 'online' : 'offline'} />}
          {name.toUpperCase()}
        </div>
        {sub && <div className="dim">{sub}</div>}
      </div>
      <div className="flex gap-1 flex-wrap">{children}</div>
    </div>
  );
}

export default function Contacts() {
  const { user } = useAuth();
  const ui = useUI();
  const nav = useNavigate();
  const data = useData();
  const [params, setParams] = useSearchParams();
  const tab = ['contacts', 'requests', 'find'].includes(params.get('tab')) ? params.get('tab') : 'contacts';
  const [busy, setBusy] = useState('');
  const [verify, setVerify] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    data.refreshContacts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced user search
  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) {
      setResults(null);
      setSearchErr('');
      return undefined;
    }
    const mine = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/users/search?q=${encodeURIComponent(term)}`);
        if (mine === seq.current) {
          setResults(r.results);
          setSearchErr('');
        }
      } catch (e) {
        if (mine === seq.current) setSearchErr(errMsg(e));
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const act = (key, fn, okMsg) => async () => {
    setBusy(key);
    try {
      await fn();
      if (okMsg) ui.toast(okMsg);
    } catch (e) {
      ui.toast(errMsg(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const refreshSearch = () => setQ((x) => x + ''); // re-run effect is not triggered by same value; refresh manually below
  const research = async () => {
    const term = q.trim().toLowerCase();
    if (term.length >= 2) setResults((await api.get(`/users/search?q=${encodeURIComponent(term)}`)).results);
  };

  const sendRequest = (u) =>
    act(`req-${u.id}`, async () => {
      await api.post('/contacts/request', { userId: u.id });
      await Promise.all([data.refreshContacts(), research()]);
    }, `REQUEST SENT TO ${u.username.toUpperCase()}`);
  const accept = (c) =>
    act(`acc-${c.id}`, async () => {
      await api.post(`/contacts/${c.id}/accept`);
      await data.refreshContacts();
      research().catch(() => {});
    }, `${c.user.username.toUpperCase()} ADDED TO CONTACTS`);
  const reject = (c) =>
    act(`rej-${c.id}`, async () => {
      await api.post(`/contacts/${c.id}/reject`);
      await data.refreshContacts();
    }, 'REQUEST REJECTED');
  const cancel = (c) =>
    act(`can-${c.id}`, async () => {
      await api.del(`/contacts/${c.id}`);
      await data.refreshContacts();
      research().catch(() => {});
    }, 'REQUEST CANCELLED');
  const remove = (c) => async () => {
    const ok = await ui.confirm({ title: 'Remove Contact', message: `Remove ${c.user.username.toUpperCase()} from your contacts?\nYou will not be able to message each other until you reconnect.`, confirmLabel: 'REMOVE', danger: true });
    if (!ok) return;
    await act(`rm-${c.id}`, async () => {
      await api.del(`/contacts/${c.id}`);
      await Promise.all([data.refreshContacts(), data.refreshConversations()]);
    }, 'CONTACT REMOVED')();
  };
  const message = (u) =>
    act(`msg-${u.id}`, async () => {
      const { conversation } = await api.post('/conversations', { userId: u.id });
      data.refreshConversations();
      nav(`/inbox/${conversation.id}`);
    });

  const { contacts, errors } = data;
  const reqCount = contacts?.incoming?.length || 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 p-2 gap-0">
      <Tabs
        label="Contacts sections"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { id: 'contacts', label: `My Contacts${contacts ? ` (${contacts.contacts.length})` : ''}` },
          { id: 'requests', label: 'Requests', count: reqCount },
          { id: 'find', label: 'Find Users' },
        ]}
      />
      <div className="tabpanel flex-1 min-h-0 overflow-auto" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {contacts === null ? (
          <Loading label="LOADING CONTACTS" />
        ) : errors.contacts && !contacts.contacts.length && !contacts.incoming.length ? (
          <ErrorBox onRetry={data.refreshContacts} title="COULD NOT LOAD CONTACTS">{errors.contacts}</ErrorBox>
        ) : tab === 'contacts' ? (
          contacts.contacts.length === 0 ? (
            <Empty icon="contacts" title="NO CONTACTS YET">
              Find people by username and send a contact request.
              <div className="mt-2">
                <Btn onClick={() => setParams({ tab: 'find' })}>FIND USERS</Btn>
              </div>
            </Empty>
          ) : (
            <div className="list">
              {contacts.contacts.map((c) => {
                const online = data.peerOnline(c.user);
                return (
                  <Person key={c.id} name={c.user.username} online={online} sub={online ? 'ONLINE' : `OFFLINE${data.peerLastSeen(c.user) ? ` - LAST SEEN ${fmtAgo(data.peerLastSeen(c.user))}` : ''}`}>
                    <Btn size="sm" variant="primary" onClick={message(c.user)} disabled={busy === `msg-${c.user.id}`}>
                      MESSAGE
                    </Btn>
                    <Btn size="sm" icon="key" onClick={() => setVerify(c.user)}>
                      KEYS
                    </Btn>
                    <Btn size="sm" variant="danger" onClick={remove(c)} disabled={busy === `rm-${c.id}`}>
                      REMOVE
                    </Btn>
                  </Person>
                );
              })}
            </div>
          )
        ) : tab === 'requests' ? (
          <div className="flex flex-col gap-3">
            <div>
              <div className="font-bold mb-1">INCOMING REQUESTS ({contacts.incoming.length})</div>
              {contacts.incoming.length === 0 ? (
                <Empty icon="inbox" title="NO PENDING REQUESTS" />
              ) : (
                <div className="list">
                  {contacts.incoming.map((c) => (
                    <Person key={c.id} name={c.user.username} sub={`Requested ${fmtAgo(c.at)}`}>
                      <Btn size="sm" variant="primary" onClick={accept(c)} disabled={!!busy}>
                        ACCEPT
                      </Btn>
                      <Btn size="sm" onClick={reject(c)} disabled={!!busy}>
                        REJECT
                      </Btn>
                    </Person>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="font-bold mb-1">SENT REQUESTS ({contacts.outgoing.length})</div>
              {contacts.outgoing.length === 0 ? (
                <div className="dim">You have no outgoing requests.</div>
              ) : (
                <div className="list">
                  {contacts.outgoing.map((c) => (
                    <Person key={c.id} name={c.user.username} sub={`Pending since ${fmtAgo(c.at)}`}>
                      <Btn size="sm" onClick={cancel(c)} disabled={!!busy}>
                        CANCEL
                      </Btn>
                    </Person>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div>
              <label htmlFor="find-q" className="font-bold block mb-0.5">
                SEARCH BY USERNAME:
              </label>
              <Field id="find-q" value={q} onChange={(e) => setQ(e.target.value.toLowerCase())} placeholder="type at least 2 characters..." maxLength={20} autoComplete="off" data-autofocus autoFocus />
            </div>
            {searching && <div className="dim">SEARCHING...</div>}
            {searchErr && <ErrorBox title="SEARCH FAILED">{searchErr}</ErrorBox>}
            {results && !searching && results.length === 0 && <Empty icon="folder" title="NO USERS FOUND" />}
            {results && results.length > 0 && (
              <div className="list">
                {results.map((u) => (
                  <Person key={u.id} name={u.username} sub={u.statusMessage}>
                    {u.relation === 'none' && (
                      <Btn size="sm" variant="primary" onClick={sendRequest(u)} disabled={busy === `req-${u.id}`}>
                        SEND REQUEST
                      </Btn>
                    )}
                    {u.relation === 'pending_out' && (
                      <Btn size="sm" disabled>
                        REQUEST PENDING
                      </Btn>
                    )}
                    {u.relation === 'pending_in' && (
                      <Btn size="sm" variant="primary" onClick={sendRequest(u)} disabled={busy === `req-${u.id}`}>
                        ACCEPT REQUEST
                      </Btn>
                    )}
                    {u.relation === 'contact' && (
                      <Btn size="sm" onClick={message(u)}>
                        MESSAGE
                      </Btn>
                    )}
                  </Person>
                ))}
              </div>
            )}
            {!results && !searching && <div className="dim">Usernames only. Email addresses are never searchable.</div>}
          </div>
        )}
      </div>
      {verify && <FingerprintDialog me={user} peer={verify} trust="ok" onClose={() => setVerify(null)} />}
    </div>
  );
}
