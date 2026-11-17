import { useEffect, useState } from 'react';
import { checkSupport } from '../services/crypto.js';

let cached = null;
export const probeSupport = () => (cached ||= checkSupport());

// Resolves once whether this browser can do X25519 + HKDF + AES-GCM through Web Crypto.
export function useCryptoSupport() {
  const [state, setState] = useState({ checked: false, ok: true, reason: '' });
  useEffect(() => {
    let alive = true;
    probeSupport().then((r) => alive && setState({ checked: true, ...r }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
