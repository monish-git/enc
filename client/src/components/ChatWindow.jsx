import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MessageBubble from './MessageBubble.jsx';
import { EncryptionPreview, FingerprintDialog } from './MessageDialogs.jsx';
import PixelIcon from './PixelIcon.jsx';
import { Btn, Empty, ErrorBox, Field, Lamp, Loading } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useMessageSearch } from '../hooks/useMessageSearch.js';
import { api, errMsg } from '../services/api.js';
import { emitSocket, onSocket } from '../services/socket.js';
import { encryptPayload, MAX_FILE_BYTES } from '../services/encryption.js';
import { b64encode } from '../services/crypto.js';
import * as km from '../services/keyManager.js';
import { clog } from '../services/clientLog.js';
import { fmtAgo, fmtBytes, safeFilename } from '../utils/format.js';

const MAX_CHARS = 4000;

export default function ChatWindow({ id, basePath, onBack }) {
  const nav = useNavigate();
  const { user, keyStatus } = useAuth();
  const ui = useUI();
  const data = useData();

  const [conv, setConv] = useState(null);
  const [convErr, setConvErr] = useState('');
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [msgErr, setMsgErr] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hideToken, setHideToken] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [trust, setTrust] = useState('ok'); // ok | changed
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState(null);
  const [encrypting, setEncrypting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);

  const listRef = useRef(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const fileInput = useRef(null);
  const textRef = useRef(null);

  const peer = conv?.peer || null;

  /* ------------------------------------------------------------ loading */
  const loadConv = useCallback(async () => {
    try {
      const { conversation } = await api.get(`/conversations/${id}`);
      setConv(conversation);
      setConvErr('');
    } catch (e) {
      setConvErr(errMsg(e));
    }
  }, [id]);

  const loadMessages = useCallback(async () => {
    try {
      const r = await api.get(`/conversations/${id}/messages?limit=50`);
      stick.current = true;
      setMessages(r.messages);
      setHasMore(r.hasMore);
      setMsgErr('');
    } catch (e) {
      setMsgErr(errMsg(e));
      setMessages((m) => m ?? []);
    }
  }, [id]);

  useEffect(() => {
    setConv(null);
    setConvErr('');
    setMessages(null);
    setDraft('');
    setFile(null);
    setSearchOpen(false);
    setPreview(null);
    loadConv();
    loadMessages();
    data.activeConv.current = id;
    return () => {
      if (data.activeConv.current === id) data.activeConv.current = null;
      clearTimeout(typingTimer.current);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsert = useCallback((m) => {
    setMessages((list) => {
      if (!list) return list;
      if (list.some((x) => x.id === m.id)) return list.map((x) => (x.id === m.id ? { ...x, ...m } : x));
      return [...list, m].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    });
  }, []);

  /* ------------------------------------------------------------ realtime */
  useEffect(() => {
    const offs = [
      onSocket('message:new', ({ message }) => {
        if (message.conversationId === id) {
          upsert(message);
        }
      }),
      onSocket('message:status', ({ conversationId, ids, status }) => {
        if (conversationId !== id) return;
        setMessages((list) => list?.map((m) => (ids.includes(m.id) ? { ...m, status } : m)));
      }),
      onSocket('contact:key-changed', loadConv),
      onSocket('contacts:update', loadConv),
      onSocket('_connect', () => {
        loadConv();
        loadMessages();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [id, upsert, loadConv, loadMessages]);

  /* ------------------------------------------------------------ read receipts */
  const unreadMine = messages?.some((m) => m.recipientId === user.id && m.status !== 'read');
  useEffect(() => {
    if (!unreadMine) return undefined;
    const mark = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await api.post(`/conversations/${id}/read`);
        setMessages((list) => list?.map((m) => (m.recipientId === user.id ? { ...m, status: 'read' } : m)));
        data.refreshUnread();
        data.refreshConversations();
      } catch {
        /* retried on the next event */
      }
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [unreadMine, id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------ key trust (TOFU) */
  useEffect(() => {
    if (!peer) return;
    const pin = km.getPin(user.id, peer.id);
    if (!pin) {
      km.setPin(user.id, peer.id, peer.keyFingerprint);
      clog(`PINNED KEY OF ${peer.username.toUpperCase()} (FIRST USE)`);
      setTrust('ok');
    } else setTrust(pin.fingerprint === peer.keyFingerprint ? 'ok' : 'changed');
  }, [peer?.id, peer?.keyFingerprint, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptKey = () => {
    km.setPin(user.id, peer.id, peer.keyFingerprint);
    clog(`TRUSTED NEW KEY OF ${peer.username.toUpperCase()}`, 'warn');
    setTrust('ok');
    setVerifyOpen(false);
  };

  /* ------------------------------------------------------------ scrolling */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = 0;
    } else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, conv, data.isTyping(id)]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = (e) => {
    const el = e.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    if (!messages?.length) return;
    setLoadingMore(true);
    try {
      const r = await api.get(`/conversations/${id}/messages?limit=50&before=${encodeURIComponent(messages[0].createdAt)}`);
      prevHeight.current = listRef.current?.scrollHeight || 0;
      stick.current = false;
      setMessages((l) => [...r.messages, ...l]);
      setHasMore(r.hasMore);
    } catch (e) {
      ui.toast(errMsg(e), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  /* ------------------------------------------------------------ search */
  const peerFor = useCallback(() => peer, [peer]);
  const search = useMessageSearch({ messages, me: user, peerFor, enabled: searchOpen });

  /* ------------------------------------------------------------ typing */
  const sendTyping = (on) => emitSocket('typing', { conversationId: id, typing: on });
  const onDraft = (e) => {
    setDraft(e.target.value);
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      sendTyping(true);
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      lastTypingSent.current = 0;
      sendTyping(false);
    }, 2500);
  };

  /* ------------------------------------------------------------ attach */
  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return ui.toast(`FILE TOO LARGE (MAX ${fmtBytes(MAX_FILE_BYTES)})`, 'error');
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      setFile({ name: safeFilename(f.name), type: f.type || 'application/octet-stream', size: f.size, data: b64encode(buf) });
    } catch {
      ui.toast('COULD NOT READ FILE', 'error');
    }
  };

  /* ------------------------------------------------------------ send */
  const canMessage = conv?.canMessage !== false;
  const text = draft.trim();
  const canSend = (text || file) && !encrypting && !sending && canMessage && trust === 'ok' && !!peer;

  const prepare = async () => {
    if (!canSend) return;
    if (!(await ui.ensureUnlocked())) return;
    setEncrypting(true);
    try {
      const out = await encryptPayload({ payload: { text, file }, conversationId: id, me: user, peer });
      clog('MESSAGE ENCRYPTED');
      if (user.settings.previewBeforeSend) setPreview({ original: text, fileName: file?.name, out });
      else await transmit(out);
    } catch (e) {
      ui.toast(`ENCRYPTION FAILED: ${errMsg(e)}`, 'error');
    } finally {
      setEncrypting(false);
    }
  };

  const transmit = async (out) => {
    setSending(true);
    try {
      const r = await api.post(`/conversations/${id}/messages`, out);
      stick.current = true;
      upsert(r.message);
      setDraft('');
      setFile(null);
      setPreview(null);
      clearTimeout(typingTimer.current);
      sendTyping(false);
      ui.play('send');
      clog('MESSAGE TRANSMITTED');
      data.refreshConversations();
      textRef.current?.focus();
    } catch (e) {
      setPreview(null);
      if (e.code === 'RECIPIENT_KEY_CHANGED' && e.data?.peer) {
        setConv((c) => ({ ...c, peer: e.data.peer }));
        ui.toast('THE RECIPIENT\'S KEY CHANGED. VERIFY IT, THEN SEND AGAIN.', 'error');
      } else if (e.code === 'SENDER_KEY_MISMATCH') {
        ui.toast('YOUR KEY CHANGED ON ANOTHER DEVICE. RELOAD THE PAGE.', 'error');
      } else ui.toast(errMsg(e), 'error');
    } finally {
      setSending(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      prepare();
    }
  };

  /* ------------------------------------------------------------ header actions */
  const toggleArchive = async () => {
    try {
      await api.put(`/conversations/${id}/archive`, { archived: !conv.archived });
      ui.toast(conv.archived ? 'CONVERSATION RESTORED TO INBOX' : 'CONVERSATION ARCHIVED');
      await Promise.all([data.refreshConversations(), data.refreshArchived()]);
      nav(basePath);
    } catch (e) {
      ui.toast(errMsg(e), 'error');
    }
  };
  const del = async () => {
    const ok = await ui.confirm({
      title: 'Delete Conversation',
      message: `Delete your conversation with ${peer.username.toUpperCase()}?\nThe history is removed from YOUR view. It reappears empty if either of you sends a new message.`,
      confirmLabel: 'DELETE',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/conversations/${id}`);
      ui.toast('CONVERSATION DELETED');
      await Promise.all([data.refreshConversations(), data.refreshArchived(), data.refreshUnread()]);
      nav(basePath);
    } catch (e) {
      ui.toast(errMsg(e), 'error');
    }
  };

  /* ------------------------------------------------------------ render */
  if (convErr) return <ErrorBox onRetry={loadConv} title="CANNOT OPEN CONVERSATION">{convErr}</ErrorBox>;
  if (!conv) return <Loading label="OPENING CONVERSATION" />;

  const online = data.peerOnline(peer);
  const typing = data.isTyping(id);
  const shown = search.shown || [];
  const unlocked = keyStatus === 'unlocked';

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {/* conversation header */}
      <div className="flex items-center gap-2 p-1.5 flex-wrap" style={{ boxShadow: '0 1px 0 var(--lo), 0 2px 0 var(--hi)' }}>
        {onBack && (
          <button type="button" className="btn icon md:hidden" onClick={onBack} aria-label="Back to conversation list">
            ◄
          </button>
        )}
        <PixelIcon name="user" size={24} />
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate text-[13px]">{peer.username.toUpperCase()}</div>
          <div className="flex items-center gap-1.5 dim">
            <Lamp state={online ? 'on' : 'off'} />
            {online ? 'ONLINE' : `OFFLINE${data.peerLastSeen(peer) ? ` - LAST SEEN ${fmtAgo(data.peerLastSeen(peer))}` : ''}`}
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          <Btn size="sm" icon="key" onClick={() => setVerifyOpen(true)} title="Verify encryption keys">
            VERIFY KEYS
          </Btn>
          <Btn size="sm" onClick={() => setSearchOpen((s) => !s)} aria-pressed={searchOpen} className={searchOpen ? 'pressed' : ''}>
            SEARCH
          </Btn>
          <Btn size="sm" icon="lock" onClick={() => setHideToken((t) => t + 1)} title="Hide all decrypted messages">
            HIDE ALL
          </Btn>
          <Btn size="sm" icon="archive" onClick={toggleArchive}>
            {conv.archived ? 'RESTORE' : 'ARCHIVE'}
          </Btn>
          <Btn size="sm" icon="trash" variant="danger" onClick={del}>
            DELETE
          </Btn>
        </div>
      </div>

      {searchOpen && (
        <div className="p-1.5 flex items-center gap-2 flex-wrap" style={{ boxShadow: '0 1px 0 var(--lo), 0 2px 0 var(--hi)' }}>
          <label htmlFor="msg-search" className="font-bold">
            FIND:
          </label>
          <Field id="msg-search" className="flex-1 min-w-[120px]" value={search.q} onChange={(e) => search.setQ(e.target.value)} placeholder="search this conversation..." data-autofocus autoFocus />
          <span className="dim">
            {search.locked ? 'UNLOCK KEYS TO SEARCH' : search.busy ? 'INDEXING...' : search.active ? `${shown.length} MATCH${shown.length === 1 ? '' : 'ES'}` : 'LOCAL SEARCH - RESULTS STAY ENCRYPTED'}
          </span>
          {search.locked && (
            <Btn size="sm" onClick={() => ui.ensureUnlocked()}>
              UNLOCK
            </Btn>
          )}
        </div>
      )}

      {trust === 'changed' && (
        <div className="m-1.5 p-2 raised flex items-center gap-2 flex-wrap" role="alert">
          <PixelIcon name="warn" size={20} />
          <span className="flex-1 min-w-[200px] font-bold">SECURITY WARNING: {peer.username.toUpperCase()}'S ENCRYPTION KEY CHANGED. SENDING IS BLOCKED UNTIL YOU VERIFY IT.</span>
          <Btn size="sm" variant="danger" onClick={() => setVerifyOpen(true)}>
            REVIEW KEY
          </Btn>
        </div>
      )}

      {/* message history */}
      <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-auto p-2 flex flex-col gap-2" style={{ background: 'var(--bg)' }} role="log" aria-live="polite" aria-label="Message history">
        {messages === null ? (
          <Loading label="LOADING MESSAGES" />
        ) : (
          <>
            {msgErr && <ErrorBox onRetry={loadMessages} title="COULD NOT LOAD MESSAGES">{msgErr}</ErrorBox>}
            {hasMore && !search.active && (
              <div className="text-center">
                <Btn size="sm" onClick={loadOlder} disabled={loadingMore}>
                  {loadingMore ? 'LOADING...' : '▲ LOAD OLDER MESSAGES'}
                </Btn>
              </div>
            )}
            {messages.length === 0 && !msgErr && (
              <Empty icon="lock" title="NO MESSAGES YET">
                Say hello. Everything you type is encrypted in your browser before it is sent.
              </Empty>
            )}
            {search.active && shown.length === 0 && messages.length > 0 && !search.busy && <Empty icon="folder" title="NO MATCHES" />}
            {shown.map((m) => (
              <MessageBubble key={m.id} message={m} mine={m.senderId === user.id} peer={peer} hideToken={hideToken} marked={search.active} />
            ))}
            {typing && (
              <div className="font-term text-[18px] dim" role="status">
                {peer.username.toUpperCase()} IS TYPING<span className="cursor" />
              </div>
            )}
          </>
        )}
      </div>

      {/* composer */}
      <div className="p-1.5 flex flex-col gap-1.5" style={{ boxShadow: '0 -1px 0 var(--lo), 0 -2px 0 var(--hi)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Lamp state={unlocked ? 'on' : 'warn'} />
          {unlocked ? (
            <span className="font-bold">ENCRYPTION: ACTIVE <span className="dim font-normal">AES-256-GCM / X25519 / HKDF</span></span>
          ) : (
            <span className="font-bold">
              ENCRYPTION: KEYS LOCKED{' '}
              <button type="button" className="link" onClick={() => ui.ensureUnlocked()}>
                unlock
              </button>
            </span>
          )}
          <span className="ml-auto dim">
            {draft.length}/{MAX_CHARS}
          </span>
        </div>

        {!canMessage ? (
          <div className="p-2 raised">YOU ARE NO LONGER CONNECTED WITH THIS USER. RE-ADD THEM FROM CONTACTS TO CONTINUE.</div>
        ) : (
          <div className="flex gap-1.5 items-end">
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {file && (
                <div className="flex items-center gap-2 raised px-2 py-0.5 w-fit max-w-full">
                  <PixelIcon name="folder" size={14} />
                  <span className="truncate">
                    {file.name} ({fmtBytes(file.size)})
                  </span>
                  <button type="button" className="link" onClick={() => setFile(null)} aria-label="Remove attachment">
                    remove
                  </button>
                </div>
              )}
              <label htmlFor="composer" className="sr-only">
                Message
              </label>
              <textarea
                id="composer"
                ref={textRef}
                className="field"
                rows={2}
                maxLength={MAX_CHARS}
                value={draft}
                onChange={onDraft}
                onKeyDown={onKey}
                placeholder="Type a message. It is encrypted before it is sent. (Enter = send, Shift+Enter = new line)"
                disabled={!!preview}
              />
            </div>
            <input ref={fileInput} type="file" className="hidden" onChange={onPickFile} />
            <Btn onClick={() => fileInput.current?.click()} title={`Attach a file (max ${fmtBytes(MAX_FILE_BYTES)})`} aria-label="Attach file" className="!min-w-0">
              <PixelIcon name="folder" size={14} /> ATTACH
            </Btn>
            <Btn variant="primary" onClick={prepare} disabled={!canSend}>
              {encrypting ? 'ENCRYPTING...' : sending ? 'SENDING...' : 'SEND'}
            </Btn>
          </div>
        )}
      </div>

      {preview && <EncryptionPreview preview={preview} sending={sending} onSend={() => transmit(preview.out)} onCancel={() => setPreview(null)} />}
      {verifyOpen && <FingerprintDialog me={user} peer={peer} trust={trust} onAccept={acceptKey} onClose={() => setVerifyOpen(false)} />}
    </div>
  );
}
