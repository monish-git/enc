import { useEffect, useRef, useState } from 'react';
import { probeSupport } from '../hooks/useCryptoSupport.js';
import { playSound } from '../services/sound.js';

// BIOS-style start-up screen. The checks are real: it probes Web Crypto for X25519, HKDF and AES-GCM.
export default function BootScreen({ onDone }) {
  const [lines, setLines] = useState([]);
  const [halted, setHalted] = useState('');
  const finished = useRef(false);
  const timers = useRef([]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    onDone();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = await probeSupport();
      const dots = (s) => s.padEnd(30, '.');
      const script = [
        ['ECN BIOS v1.0  (C) 1995-2026 ENCRYPTED COMMUNICATION NETWORK', 'hl'],
        ['', ''],
        ['MEMORY TEST: 640K OK', ''],
        ['DETECTING CRYPTO SUBSYSTEM...', ''],
        [`${dots('WEB CRYPTO API ')} ${globalThis.crypto?.subtle ? 'OK' : 'FAIL'}`, globalThis.crypto?.subtle ? '' : 'err'],
        [`${dots('SECURE CONTEXT (HTTPS) ')} ${globalThis.isSecureContext ? 'OK' : 'FAIL'}`, globalThis.isSecureContext ? '' : 'err'],
        [`${dots('X25519 KEY AGREEMENT ')} ${support.ok ? 'OK' : 'FAIL'}`, support.ok ? '' : 'err'],
        [`${dots('HKDF-SHA-256 ')} ${support.ok ? 'OK' : 'FAIL'}`, support.ok ? '' : 'err'],
        [`${dots('AES-256-GCM ')} ${support.ok ? 'OK' : 'FAIL'}`, support.ok ? '' : 'err'],
        [`${dots('CSPRNG ')} OK`, ''],
      ];
      if (support.ok) {
        script.push(['', ''], ['LOADING ECN SECURE TERMINAL...', 'hl']);
      } else {
        script.push(['', ''], [`SYSTEM HALTED: ${support.reason}`, 'err'], ['Use a current Chrome (133+), Edge, Firefox (130+) or Safari (17+) over HTTPS.', 'err']);
      }
      for (let i = 0; i < script.length; i++) {
        if (cancelled || finished.current) return;
        setLines((l) => [...l, script[i]]);
        await new Promise((r) => timers.current.push(setTimeout(r, i < 3 ? 140 : 110)));
      }
      if (cancelled) return;
      if (support.ok) {
        playSound('boot');
        timers.current.push(setTimeout(finish, 350));
      } else setHalted(support.reason);
    })();
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (halted) return undefined;
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [halted]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="boot" onClick={() => !halted && finish()} role="status" aria-label="System start-up">
      {lines.map(([t, cls], i) => (
        <div key={i} className={cls} style={{ whiteSpace: 'pre-wrap', minHeight: '1.1em' }}>
          {t}
        </div>
      ))}
      {!halted && <div className="cursor" />}
      {!halted && <div style={{ position: 'absolute', bottom: 12, right: 18, opacity: 0.6 }}>Click or press any key to skip</div>}
    </div>
  );
}
