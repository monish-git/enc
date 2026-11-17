import { useEffect, useMemo, useRef, useState } from 'react';
import { decryptMessage } from '../services/encryption.js';
import * as km from '../services/keyManager.js';

// Client-side message search. The server cannot search ciphertext, so matching happens locally:
// messages are decrypted in memory ONLY to build a throw-away index, and the results stay in their
// encrypted display until the user decides to decrypt them. The index is wiped when keys lock.
export function useMessageSearch({ messages, me, peerFor, enabled }) {
  const [q, setQ] = useState('');
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState(false);
  const index = useRef(new Map()); // message id -> lowercase searchable text

  useEffect(() => km.subscribe(() => !km.isUnlocked() && (index.current.clear(), setVer((v) => v + 1))), []);
  useEffect(() => {
    if (!enabled) {
      index.current.clear();
      setQ('');
    }
  }, [enabled]);

  const term = q.trim().toLowerCase();
  useEffect(() => {
    if (!enabled || !term || !messages || !km.isUnlocked(me.id)) return undefined;
    let cancelled = false;
    (async () => {
      setBusy(true);
      for (const m of messages) {
        if (cancelled) return;
        if (index.current.has(m.id)) continue;
        const peer = peerFor(m);
        try {
          const p = await decryptMessage({ message: m, me, peer });
          index.current.set(m.id, `${p.text} ${p.file?.name || ''}`.toLowerCase());
        } catch {
          index.current.set(m.id, '');
        }
      }
      if (!cancelled) {
        setBusy(false);
        setVer((v) => v + 1);
      }
    })();
    return () => {
      cancelled = true;
      setBusy(false);
    };
  }, [enabled, term, messages, me, peerFor]);

  const shown = useMemo(() => {
    if (!enabled || !term || !messages) return messages;
    return messages.filter((m) => index.current.get(m.id)?.includes(term));
  }, [enabled, term, messages, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  return { q, setQ, shown, busy, active: enabled && !!term, locked: enabled && !km.isUnlocked(me.id) };
}
