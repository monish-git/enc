import { useEffect, useMemo, useState } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=#$%&@';
const rnd = () => CHARS[(Math.random() * CHARS.length) | 0];

// Terminal-style reveal. NOTE: this is presentation only - it runs AFTER the real AES-GCM decryption
// has succeeded and authenticated the message; the text revealed here is the actual decrypted output.
export default function DecryptionAnimation({ plain, onDone }) {
  const chars = useMemo(() => Array.from(plain), [plain]);
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(() => (reduce ? plain : chars.map((c) => (/\s/.test(c) ? c : rnd())).join('')));

  useEffect(() => {
    if (reduce || chars.length === 0) {
      onDone?.();
      return undefined;
    }
    const total = Math.min(1600, 350 + chars.length * 18);
    const start = performance.now();
    let raf;
    let last = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / total);
      if (t - last > 35 || p === 1) {
        last = t;
        const n = Math.floor(p * chars.length);
        let out = '';
        for (let i = 0; i < chars.length; i++) out += i < n || /\s/.test(chars[i]) ? chars[i] : rnd();
        setShown(out);
      }
      if (p < 1) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chars]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="plain scramble" aria-label="Decrypting message">
      {shown}
    </div>
  );
}
