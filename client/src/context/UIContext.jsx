import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from './AuthContext.jsx';
import { Btn, Dialog, Field, Label, TitleBar } from '../components/ui.jsx';
import PixelIcon from '../components/PixelIcon.jsx';
import KeyDialog from '../components/KeyDialog.jsx';
import { playSound, setSoundEnabled } from '../services/sound.js';
import { clog } from '../services/clientLog.js';

const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

const PREF_KEY = 'ecn.prefs';
export function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
  } catch {
    return {};
  }
}
export function applyPrefs({ theme = 'win95', crt = false, scanlines = true }) {
  const r = document.documentElement;
  r.dataset.theme = theme;
  r.dataset.crt = crt ? 'on' : 'off';
  r.dataset.scan = scanlines ? 'on' : 'off';
}

let toastSeq = 0;

export function UIProvider({ children }) {
  const { user, keyStatus, lockKeys, checkPassword } = useAuth();
  const [toasts, setToasts] = useState([]);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [authDlg, setAuthDlg] = useState(null);
  const [keyDlg, setKeyDlg] = useState(null);
  const keyDlgRef = useRef(null);
  const keyStatusRef = useRef(keyStatus);
  keyStatusRef.current = keyStatus;

  /* ---- appearance + sound prefs (persisted locally so the login screen matches) ---- */
  const s = user?.settings;
  useEffect(() => {
    const prefs = s ? { theme: s.theme, crt: s.crt, scanlines: s.scanlines, sound: s.sound } : readPrefs();
    applyPrefs(prefs);
    setSoundEnabled(!!prefs.sound);
    if (s) {
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
      } catch {
        /* storage may be blocked */
      }
    }
  }, [s?.theme, s?.crt, s?.scanlines, s?.sound]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- toasts ---- */
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, kind = 'info') => {
      const id = ++toastSeq;
      setToasts((t) => [...t.slice(-2), { id, message, kind }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
      if (kind === 'error') playSound('error');
    },
    [dismiss]
  );

  /* ---- confirm / authenticate / unlock prompts ---- */
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setConfirmDlg({ ...opts, resolve });
      }),
    []
  );
  const closeConfirm = (v) => {
    confirmDlg?.resolve(v);
    setConfirmDlg(null);
  };

  const authenticate = useCallback(
    (opts = {}) =>
      new Promise((resolve) => {
        setAuthDlg({ ...opts, resolve });
      }),
    []
  );

  const ensureUnlocked = useCallback(() => {
    if (keyStatusRef.current === 'unlocked') return Promise.resolve(true);
    if (keyDlgRef.current) return keyDlgRef.current.promise;
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    keyDlgRef.current = { promise, resolve };
    setKeyDlg(true);
    return promise;
  }, []);
  const finishKeyDialog = useCallback((ok) => {
    keyDlgRef.current?.resolve(ok);
    keyDlgRef.current = null;
    setKeyDlg(null);
  }, []);

  /* ---- auto-lock after inactivity ---- */
  const lastActive = useRef(Date.now());
  useEffect(() => {
    const bump = () => (lastActive.current = Date.now());
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, []);
  const mins = user?.settings?.autoLockMinutes ?? 0;
  useEffect(() => {
    if (keyStatus !== 'unlocked' || !mins) return;
    lastActive.current = Date.now();
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > mins * 60_000) {
        lockKeys();
        toast('KEYS AUTO-LOCKED AFTER INACTIVITY', 'warn');
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [keyStatus, mins, lockKeys, toast]);

  // log module start-up once
  useEffect(() => {
    clog('ENCRYPTION MODULE INITIALIZED');
  }, []);

  const value = useMemo(() => ({ toast, confirm, authenticate, ensureUnlocked, play: playSound }), [toast, confirm, authenticate, ensureUnlocked]);

  return (
    <UICtx.Provider value={value}>
      {children}
      <div className="crt-overlay" aria-hidden="true" />
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.12, ease: 'linear' }} className="win" style={{ width: 'min(320px, 100%)' }} role={t.kind === 'error' ? 'alert' : 'status'}>
            <TitleBar title={t.kind === 'error' ? 'ECN - ERROR' : t.kind === 'warn' ? 'ECN - WARNING' : 'ECN'} icon={t.kind === 'error' || t.kind === 'warn' ? 'warn' : 'info'} onClose={() => dismiss(t.id)} />
            <div className="p-2.5 break-words">{t.message}</div>
          </motion.div>
        ))}
      </div>

      {confirmDlg && (
        <Dialog title={confirmDlg.title || 'Confirm'} icon={confirmDlg.danger ? 'warn' : 'info'} onClose={() => closeConfirm(false)} width={400} footer={
          <>
            <Btn variant={confirmDlg.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)} data-autofocus>
              {confirmDlg.confirmLabel || 'OK'}
            </Btn>
            <Btn onClick={() => closeConfirm(false)}>CANCEL</Btn>
          </>
        }>
          <div className="flex gap-3 items-start">
            <PixelIcon name={confirmDlg.danger ? 'warn' : 'info'} size={32} />
            <div className="flex-1 min-w-0 break-words whitespace-pre-line">{confirmDlg.message}</div>
          </div>
        </Dialog>
      )}

      {authDlg && (
        <AuthPrompt
          {...authDlg}
          verify={checkPassword}
          onDone={(ok) => {
            authDlg.resolve(ok);
            setAuthDlg(null);
          }}
        />
      )}

      {keyDlg && user && <KeyDialog onDone={finishKeyDialog} />}
    </UICtx.Provider>
  );
}

// Re-authentication: the password must really open the stored private key (checked locally).
function AuthPrompt({ title = 'Authenticate', message, verify, onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const ok = await verify(pw);
    setBusy(false);
    if (ok) onDone(true);
    else {
      setErr('INCORRECT PASSWORD');
      setPw('');
    }
  };
  return (
    <Dialog title={title} icon="lock" onClose={() => onDone(false)} width={400}>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <p>{message || 'Enter your password to continue.'}</p>
        <div>
          <Label htmlFor="ap-pw">PASSWORD:</Label>
          <Field id="ap-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={busy} data-autofocus />
        </div>
        {err && (
          <div role="alert" className="font-bold">
            ERROR: {err}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Btn variant="primary" type="submit" disabled={busy || !pw}>
            {busy ? 'CHECKING...' : 'AUTHENTICATE'}
          </Btn>
          <Btn onClick={() => onDone(false)}>CANCEL</Btn>
        </div>
      </form>
    </Dialog>
  );
}
