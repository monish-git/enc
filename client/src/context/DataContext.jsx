import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, errMsg } from '../services/api.js';
import { connectSocket, disconnectSocket, onSocket, reconnectSocket } from '../services/socket.js';
import { useAuth } from './AuthContext.jsx';
import { useUI } from './UIContext.jsx';
import { clog } from '../services/clientLog.js';
import { playSound } from '../services/sound.js';

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

export function DataProvider({ children }) {
  const { user, logout } = useAuth();
  const ui = useUI();
  const [conversations, setConversations] = useState(null);
  const [archived, setArchived] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [errors, setErrors] = useState({});
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState(0);
  const [presence, setPresence] = useState({});
  const [typing, setTyping] = useState({});
  const [connected, setConnected] = useState(false);
  const activeConv = useRef(null); // conversation currently open in the chat window
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const setErr = (k, v) => setErrors((e) => ({ ...e, [k]: v }));

  const refreshConversations = useCallback(async () => {
    try {
      const { conversations: c } = await api.get('/conversations');
      setConversations(c);
      setErr('conversations', null);
    } catch (e) {
      setErr('conversations', errMsg(e));
      setConversations((x) => x ?? []);
    }
  }, []);
  const refreshArchived = useCallback(async () => {
    try {
      const { conversations: c } = await api.get('/conversations?archived=true');
      setArchived(c);
      setErr('archived', null);
    } catch (e) {
      setErr('archived', errMsg(e));
      setArchived((x) => x ?? []);
    }
  }, []);
  const refreshContacts = useCallback(async () => {
    try {
      setContacts(await api.get('/contacts'));
      setErr('contacts', null);
    } catch (e) {
      setErr('contacts', errMsg(e));
      setContacts((x) => x ?? { contacts: [], incoming: [], outgoing: [] });
    }
  }, []);
  const refreshUnread = useCallback(async () => {
    try {
      setUnread((await api.get('/conversations/unread')).unread);
    } catch {
      /* non-critical */
    }
  }, []);
  const refreshAlerts = useCallback(async () => {
    try {
      setAlerts((await api.get('/security/notifications/unread')).count);
    } catch {
      /* non-critical */
    }
  }, []);
  const refreshAll = useCallback(() => {
    refreshConversations();
    refreshArchived();
    refreshContacts();
    refreshUnread();
    refreshAlerts();
  }, [refreshConversations, refreshArchived, refreshContacts, refreshUnread, refreshAlerts]);

  // coalesce bursts of events into one refresh
  const timers = useRef({});
  const later = useCallback((key, fn, ms = 250) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    refreshAll();
    connectSocket();

    const offs = [
      onSocket('_connect', () => {
        setConnected(true);
        clog('SECURE SESSION CREATED (REAL-TIME CHANNEL ONLINE)');
        refreshAll(); // catch up on anything missed while offline
      }),
      onSocket('_disconnect', () => setConnected(false)),
      onSocket('_error', (err) => {
        setConnected(false);
        if (String(err?.message).includes('AUTH_REQUIRED')) {
          api
            .get('/auth/me', { quiet401: true })
            .then(() => later('reconnect', reconnectSocket, 2500))
            .catch(() => logout());
        }
      }),
      onSocket('message:new', ({ message }) => {
        later('conv', () => {
          refreshConversations();
          refreshArchived();
        });
        refreshUnread();
        if (message.recipientId === user.id) {
          const inThisChat = activeConv.current === message.conversationId && document.visibilityState === 'visible';
          if (!inThisChat) {
            playSound('receive');
            uiRef.current.toast('NEW ENCRYPTED MESSAGE RECEIVED', 'info');
          } else {
            playSound('receive');
          }
          clog('ENCRYPTED MESSAGE RECEIVED');
        }
      }),
      onSocket('conversation:update', () => {
        later('conv', () => {
          refreshConversations();
          refreshArchived();
        });
        refreshUnread();
      }),
      onSocket('message:status', () => later('conv', refreshConversations, 600)),
      onSocket('contacts:update', ({ reason }) => {
        later('contacts', refreshContacts);
        later('conv', refreshConversations);
        if (reason === 'request') uiRef.current.toast('NEW CONTACT REQUEST', 'info');
        if (reason === 'accepted') uiRef.current.toast('CONTACT REQUEST ACCEPTED', 'info');
      }),
      onSocket('contact:key-changed', () => {
        later('contacts', refreshContacts);
        later('conv', refreshConversations);
      }),
      onSocket('presence', ({ userId, online, lastSeen }) => setPresence((p) => ({ ...p, [userId]: { online, lastSeen } }))),
      onSocket('typing', ({ conversationId, typing: on }) => {
        setTyping((t) => ({ ...t, [conversationId]: on ? Date.now() : 0 }));
        if (on) {
          setTimeout(() => setTyping((t) => (t[conversationId] && Date.now() - t[conversationId] >= 4000 ? { ...t, [conversationId]: 0 } : t)), 4200);
        }
      }),
      onSocket('security:event', (ev) => {
        if (ev.level !== 'info') {
          refreshAlerts();
          uiRef.current.toast(ev.message, ev.level === 'alert' ? 'error' : 'warn');
        }
      }),
      onSocket('session:revoked', () => {
        uiRef.current.toast('THIS SESSION WAS SIGNED OUT', 'warn');
        logout();
      }),
    ];

    return () => {
      offs.forEach((off) => off());
      Object.values(timers.current).forEach(clearTimeout);
      disconnectSocket();
      setConnected(false);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const peerOnline = useCallback((peer) => (peer ? (presence[peer.id]?.online ?? peer.online) : false), [presence]);
  const peerLastSeen = useCallback((peer) => (peer ? (presence[peer.id]?.lastSeen ?? peer.lastSeen) : null), [presence]);
  const isTyping = useCallback((convId) => !!typing[convId] && Date.now() - typing[convId] < 4000, [typing]);

  const value = useMemo(
    () => ({
      conversations, archived, contacts, errors, unread, alerts, connected, activeConv,
      incomingRequests: contacts?.incoming?.length || 0,
      peerOnline, peerLastSeen, isTyping,
      refreshConversations, refreshArchived, refreshContacts, refreshUnread, refreshAlerts, refreshAll,
      clearAlerts: () => setAlerts(0),
    }),
    [conversations, archived, contacts, errors, unread, alerts, connected, peerOnline, peerLastSeen, isTyping, refreshConversations, refreshArchived, refreshContacts, refreshUnread, refreshAlerts, refreshAll]
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
