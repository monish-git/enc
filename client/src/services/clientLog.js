// In-memory log of client-side crypto activity (never persisted, never sent to the server, never
// contains keys or message content). Shown in the Security Center terminal alongside server events.
import { useSyncExternalStore } from 'react';

let entries = [];
let seq = 0;
const subs = new Set();
const notify = () => subs.forEach((f) => f());

export function clog(message, level = 'info') {
  entries = [...entries.slice(-299), { id: `c${++seq}`, ts: new Date(), message, level, source: 'client' }];
  notify();
}

export function clearClientLog() {
  entries = [];
  notify();
}

export function useClientLog() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => entries
  );
}
