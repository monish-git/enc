// Socket.IO client. The handshake uses a short-lived signed ticket (fetched over the authenticated
// REST API) instead of cookies, so it also works when the socket server is on another domain.
import { io } from 'socket.io-client';
import { api } from './api.js';

const URL = import.meta.env.VITE_SOCKET_URL || undefined; // undefined => same origin

let socket = null;
const listeners = new Map(); // event -> Set(fn)

function dispatch(event, ...args) {
  listeners.get(event)?.forEach((fn) => {
    try {
      fn(...args);
    } catch (err) {
      console.error('[ECN] socket handler error', event, err);
    }
  });
}

export function connectSocket() {
  if (socket) return socket;
  socket = io(URL, {
    withCredentials: false,
    reconnectionDelayMax: 10_000,
    auth: (cb) => {
      api
        .post('/auth/socket-ticket', {}, { quiet401: true })
        .then((r) => cb({ ticket: r.ticket }))
        .catch(() => cb({ ticket: '' }));
    },
  });
  socket.onAny((event, ...args) => dispatch(event, ...args));
  socket.on('connect', () => dispatch('_connect'));
  socket.on('disconnect', (reason) => dispatch('_disconnect', reason));
  socket.on('connect_error', (err) => dispatch('_error', err));
  return socket;
}

export function reconnectSocket() {
  if (socket && !socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function onSocket(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export const socketConnected = () => !!socket?.connected;
export const emitSocket = (event, payload) => {
  if (socket?.connected) socket.volatile.emit(event, payload);
};
