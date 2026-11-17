import { useCallback, useEffect, useMemo, useState } from 'react';
import TerminalWindow from './TerminalWindow.jsx';
import PixelIcon from './PixelIcon.jsx';
import { Btn, Dialog, ErrorBox, Field, Group, Label, Lamp, Loading } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { api, errMsg } from '../services/api.js';
import { onSocket } from '../services/socket.js';
import { useClientLog, clearClientLog } from '../services/clientLog.js';
import { exportBackup } from '../services/keyManager.js';
import { downloadBlob, fmtAgo, fmtDateTime, shortUA } from '../utils/format.js';
import { formatFingerprint } from '../services/crypto.js';

function ResetKeysDialog({ onClose }) {
  const { resetKeys } = useAuth();
  const ui = useUI();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await resetKeys(pw);
      ui.toast('NEW KEY PAIR GENERATED. OLD MESSAGES ARE NO LONGER READABLE.', 'warn');
      onClose();
    } catch (ex) {
      setErr(errMsg(ex));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Reset Encryption Keys" icon="warn" onClose={busy ? undefined : onClose} dismissable={!busy} width={440}>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <p className="font-bold">WARNING: THIS CANNOT BE UNDONE.</p>
        <p>A new X25519 key pair replaces your current one. Every message encrypted to the old key becomes permanently unreadable, and your contacts are told your key changed.</p>
        <div>
          <Label htmlFor="rk-pw">ACCOUNT PASSWORD:</Label>
          <Field id="rk-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={busy} data-autofocus />
        </div>
        {err && <div role="alert" className="font-bold">ERROR: {err}</div>}
        <div className="flex gap-2 justify-end">
          <Btn variant="danger" type="submit" disabled={busy || !pw}>
            {busy ? 'GENERATING...' : 'RESET KEYS'}
          </Btn>
          <Btn onClick={onClose} disabled={busy}>
            CANCEL
          </Btn>
        </div>
      </form>
    </Dialog>
  );
}

const KV = ({ k, children }) => (
  <tr>
    <td className="pr-3 font-bold whitespace-nowrap align-top">{k}</td>
    <td className="break-words">{children}</td>
  </tr>
);

export default function SecurityDashboard() {
  const { user, keyStatus, lockKeys, forgetDeviceKey } = useAuth();
  const { clearAlerts } = useData();
  const ui = useUI();
  const clientLog = useClientLog();
  const [ov, setOv] = useState(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState([]);
  const [resetOpen, setResetOpen] = useState(false);
  const [clearedAt, setClearedAt] = useState(0);

  const load = useCallback(async () => {
    try {
      setOv(await api.get('/security/overview'));
      setLive([]);
      setError('');
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // new server events stream in while the page is open
  useEffect(
    () =>
      onSocket('security:event', (ev) => {
        setLive((l) => (l.some((x) => x.id === ev.id) ? l : [...l, ev]));
      }),
    []
  );

  const logLines = useMemo(() => {
    const server = [...(ov?.events || []), ...live].map((e) => ({ id: `s${e.id}`, ts: new Date(e.createdAt), message: e.message, level: e.level }));
    const seen = new Set();
    const merged = [...server, ...clientLog.map((c) => ({ id: c.id, ts: c.ts, message: c.message, level: c.level }))].filter((l) => !seen.has(l.id) && seen.add(l.id));
    return merged.filter((l) => l.ts.getTime() > clearedAt).sort((a, b) => a.ts - b.ts).slice(-200);
  }, [ov, live, clientLog, clearedAt]);

  const act = (fn, ok) => async () => {
    try {
      await fn();
      if (ok) ui.toast(ok);
    } catch (e) {
      ui.toast(errMsg(e), 'error');
    }
  };

  const revoke = (s) =>
    act(async () => {
      await api.post(`/security/sessions/${s.id}/revoke`);
      await load();
    }, 'SESSION REVOKED');
  const revokeOthers = async () => {
    const ok = await ui.confirm({ title: 'Sign Out Other Sessions', message: 'Sign out every other device and browser?', confirmLabel: 'SIGN OUT', danger: true });
    if (!ok) return;
    await act(async () => {
      await api.post('/security/sessions/revoke-others');
      await load();
    }, 'OTHER SESSIONS SIGNED OUT')();
  };
  const markRead = act(async () => {
    await api.post('/security/notifications/read');
    clearAlerts();
    await load();
  });
  const backup = () => {
    try {
      downloadBlob(new Blob([exportBackup(user.id)], { type: 'application/json' }), `ecn-key-backup-${user.username}.json`);
      ui.toast('ENCRYPTED KEY BACKUP SAVED');
    } catch (e) {
      ui.toast(errMsg(e), 'error');
    }
  };
  const forget = async () => {
    const ok = await ui.confirm({
      title: 'Remove Key From This Device',
      message: 'Delete the private key stored in this browser?\nWithout a backup you will not be able to read your messages on this device.',
      confirmLabel: 'REMOVE KEY',
      danger: true,
    });
    if (ok) forgetDeviceKey();
  };

  if (error && !ov) return <ErrorBox title="SECURITY DATA UNAVAILABLE" onRetry={load}>{error}</ErrorBox>;
  if (!ov) return <Loading label="LOADING SECURITY DATA" />;

  const keyState = { unlocked: ['on', 'ACTIVE - KEYS UNLOCKED'], locked: ['warn', 'ACTIVE - KEYS LOCKED'], missing: ['bad', 'NO PRIVATE KEY ON THIS DEVICE'], none: ['off', ''] }[keyStatus];

  return (
    <div className="p-2 overflow-auto flex-1 min-h-0">
      <div className="grid gap-3 xl:grid-cols-2">
        <Group legend="ENCRYPTION STATUS" className="xl:col-span-2">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <table>
              <tbody>
                <KV k="ALGORITHM:">AES-256-GCM (unique 96-bit IV + new HKDF salt per message, 128-bit auth tag)</KV>
                <KV k="KEY EXCHANGE:">X25519 ECDH &rarr; HKDF-SHA-256</KV>
                <KV k="STATUS:">
                  <span className="inline-flex items-center gap-1.5">
                    <Lamp state={keyState[0]} /> <b>{keyState[1]}</b>
                  </span>
                </KV>
                <KV k="KEY FINGERPRINT:">
                  <div className="fp mt-0.5">{formatFingerprint(user.keyFingerprint, 16).split(' ').map((g, i) => <span key={i}>{g}</span>)}</div>
                </KV>
                <KV k="KEY CREATED:">{fmtDateTime(user.keyUpdatedAt)}</KV>
                <KV k="PRIVATE KEY:">Stored only in this browser, wrapped with AES-256-GCM (PBKDF2, 600,000 rounds). Never sent to the server.</KV>
              </tbody>
            </table>
            <div className="flex flex-col gap-1.5 lg:w-[210px]">
              {keyStatus === 'unlocked' ? (
                <Btn icon="lock" onClick={lockKeys}>
                  LOCK KEYS NOW
                </Btn>
              ) : (
                <Btn icon="unlock" variant="primary" onClick={() => ui.ensureUnlocked()}>
                  UNLOCK KEYS
                </Btn>
              )}
              <Btn icon="key" onClick={backup} disabled={keyStatus === 'missing'}>
                EXPORT KEY BACKUP
              </Btn>
              <Btn icon="trash" onClick={forget} disabled={keyStatus === 'missing'}>
                REMOVE KEY FROM DEVICE
              </Btn>
              <Btn icon="warn" variant="danger" onClick={() => setResetOpen(true)}>
                RESET KEYS...
              </Btn>
            </div>
          </div>
        </Group>

        <Group legend={`ACTIVE SESSIONS (${ov.sessions.length})`}>
          <div className="list max-h-[240px]">
            <table className="dt">
              <thead>
                <tr>
                  <th>DEVICE</th>
                  <th>IP</th>
                  <th>LAST ACTIVE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ov.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{shortUA(s.userAgent)}</td>
                    <td>{s.ip || '-'}</td>
                    <td>{fmtAgo(s.lastSeenAt)}</td>
                    <td className="text-right whitespace-nowrap">{s.current ? <b>THIS SESSION</b> : <Btn size="sm" onClick={revoke(s)}>REVOKE</Btn>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex justify-end">
            <Btn size="sm" variant="danger" onClick={revokeOthers} disabled={ov.sessions.length < 2}>
              SIGN OUT ALL OTHER SESSIONS
            </Btn>
          </div>
        </Group>

        <Group legend="RECENT LOGIN ACTIVITY">
          <div className="list max-h-[240px]">
            <table className="dt">
              <thead>
                <tr>
                  <th>RESULT</th>
                  <th>TIME</th>
                  <th>IP</th>
                  <th>DEVICE</th>
                </tr>
              </thead>
              <tbody>
                {ov.logins.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">
                      <Lamp state={l.success ? 'on' : 'bad'} /> {l.success ? 'OK' : 'FAILED'}
                    </td>
                    <td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                    <td>{l.ip || '-'}</td>
                    <td>{shortUA(l.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Group>

        <Group legend="FAILED AUTHENTICATION ATTEMPTS">
          <div className="flex gap-6 mb-2">
            <div>
              <div className="font-term text-[34px] leading-none">{ov.failed.last24h}</div>
              <div className="dim">LAST 24 HOURS</div>
            </div>
            <div>
              <div className="font-term text-[34px] leading-none">{ov.failed.last30d}</div>
              <div className="dim">LAST 30 DAYS</div>
            </div>
          </div>
          {ov.failed.recent.length === 0 ? (
            <div className="dim">No failed attempts recorded.</div>
          ) : (
            <div className="list max-h-[150px]">
              <table className="dt">
                <tbody>
                  {ov.failed.recent.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                      <td>{l.ip || '-'}</td>
                      <td>{l.reason === 'locked' ? 'LOCKED OUT' : 'WRONG PASSWORD'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Group>

        <Group legend={`SECURITY NOTIFICATIONS${ov.unreadNotifications ? ` (${ov.unreadNotifications} NEW)` : ''}`}>
          {ov.notifications.length === 0 ? (
            <div className="dim">No warnings. Everything looks normal.</div>
          ) : (
            <div className="list max-h-[190px]">
              {ov.notifications.map((n) => (
                <div key={n.id} className="row !items-start" style={{ fontWeight: n.unread ? 700 : 400 }}>
                  <PixelIcon name="warn" size={16} />
                  <div className="flex-1 min-w-0">
                    <div className="break-words">{n.message}</div>
                    <div className="opacity-70 text-[11px]">{fmtDateTime(n.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <Btn size="sm" onClick={markRead} disabled={!ov.unreadNotifications}>
              MARK ALL READ
            </Btn>
          </div>
        </Group>

        <Group legend="SECURITY LOG" className="xl:col-span-2">
          <TerminalWindow lines={logLines} height={230} />
          <div className="mt-2 flex gap-2 justify-end">
            <Btn size="sm" onClick={() => { setClearedAt(Date.now()); clearClientLog(); }}>
              CLEAR VIEW
            </Btn>
            <Btn size="sm" onClick={load}>
              REFRESH
            </Btn>
          </div>
          <p className="dim mt-1">The log never contains keys, passwords or message text.</p>
        </Group>
      </div>
      {resetOpen && <ResetKeysDialog onClose={() => setResetOpen(false)} />}
    </div>
  );
}
