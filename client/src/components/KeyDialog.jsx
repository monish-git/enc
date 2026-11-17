import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Btn, Check, Dialog, Field, Group, Label, PixelBar } from './ui.jsx';
import { errMsg } from '../services/api.js';

// Unlocks the private key (password), restores it from a backup file, or creates a new key pair.
export default function KeyDialog({ onDone }) {
  const { user, keyStatus, unlockKeys, importKeys, resetKeys, logout } = useAuth();
  const [mode, setMode] = useState(keyStatus === 'missing' ? 'recover' : 'unlock');
  const [pw, setPw] = useState('');
  const [bpw, setBpw] = useState('');
  const [file, setFile] = useState(null);
  const [npw, setNpw] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    if (keyStatus === 'unlocked' && !doneRef.current) {
      doneRef.current = true;
      onDone(true);
    }
  }, [keyStatus, onDone]);

  const run = (label, fn) => async (e) => {
    e?.preventDefault();
    setErr('');
    setBusy(label);
    try {
      await fn();
    } catch (ex) {
      setErr(errMsg(ex));
    } finally {
      setBusy('');
    }
  };

  const doUnlock = run('DERIVING KEY (PBKDF2 600,000 ROUNDS)', async () => {
    await unlockKeys(pw);
    setPw('');
  });
  const doImport = run('VERIFYING BACKUP', async () => {
    if (!file) throw new Error('CHOOSE A BACKUP FILE FIRST');
    await importKeys(await file.text(), bpw);
    setBpw('');
  });
  const doReset = run('GENERATING X25519 KEY PAIR', async () => {
    if (!sure) throw new Error('CONFIRM THAT YOU UNDERSTAND THE CONSEQUENCES');
    await resetKeys(npw);
    setNpw('');
  });

  const cancel = () => {
    if (!doneRef.current) {
      doneRef.current = true;
      onDone(false);
    }
  };

  return (
    <Dialog title={mode === 'unlock' ? 'Unlock Encryption Keys' : 'Encryption Key Setup'} icon={mode === 'unlock' ? 'lock' : 'key'} onClose={cancel} width={480}>
      {busy && (
        <div className="mb-3">
          <PixelBar label={busy} />
        </div>
      )}

      {mode === 'unlock' ? (
        <form onSubmit={doUnlock} className="flex flex-col gap-2.5">
          <p>
            YOUR PRIVATE KEY IS LOCKED. Enter your password to unlock it. The key never leaves this browser and is only held in memory while unlocked.
          </p>
          <div>
            <Label htmlFor="kd-pw">PASSWORD:</Label>
            <Field id="kd-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={!!busy} required data-autofocus />
          </div>
          {err && (
            <div role="alert" className="font-bold">
              ERROR: {err}
            </div>
          )}
          <div className="flex gap-2 justify-end flex-wrap">
            <Btn variant="primary" type="submit" disabled={!!busy || !pw}>
              UNLOCK
            </Btn>
            <Btn onClick={cancel} disabled={!!busy}>
              CANCEL
            </Btn>
          </div>
          <button type="button" className="link text-left" onClick={() => setMode('recover')}>
            Forgot the password / restore from backup...
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p>
            {keyStatus === 'missing' ? (
              <>
                NO MATCHING PRIVATE KEY WAS FOUND ON THIS DEVICE for <b>{user?.username?.toUpperCase()}</b>. Messages cannot be encrypted or decrypted here until you restore your key or create a new one.
              </>
            ) : (
              <>Restore your key from a backup or create a new key pair.</>
            )}
          </p>

          <Group legend="Option 1 - Import key backup">
            <form onSubmit={doImport} className="flex flex-col gap-2">
              <div>
                <Label htmlFor="kd-file">BACKUP FILE (.json):</Label>
                <input id="kd-file" type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={!!busy} />
              </div>
              <div>
                <Label htmlFor="kd-bpw">PASSWORD USED WHEN THE BACKUP WAS MADE:</Label>
                <Field id="kd-bpw" type="password" autoComplete="off" value={bpw} onChange={(e) => setBpw(e.target.value)} disabled={!!busy} />
              </div>
              <div className="flex justify-end">
                <Btn type="submit" disabled={!!busy || !file || !bpw}>
                  IMPORT KEY
                </Btn>
              </div>
            </form>
          </Group>

          <Group legend="Option 2 - Generate new keys">
            <form onSubmit={doReset} className="flex flex-col gap-2">
              <p className="dim">A new key pair replaces the old one. Messages encrypted to the OLD key become permanently unreadable.</p>
              <div>
                <Label htmlFor="kd-npw">ACCOUNT PASSWORD:</Label>
                <Field id="kd-npw" type="password" autoComplete="current-password" value={npw} onChange={(e) => setNpw(e.target.value)} disabled={!!busy} />
              </div>
              <Check label="I understand old messages will be lost" checked={sure} onChange={setSure} />
              <div className="flex justify-end">
                <Btn variant="danger" type="submit" disabled={!!busy || !npw || !sure}>
                  GENERATE NEW KEYS
                </Btn>
              </div>
            </form>
          </Group>

          {err && (
            <div role="alert" className="font-bold">
              ERROR: {err}
            </div>
          )}
          <div className="flex gap-2 justify-between flex-wrap">
            {keyStatus === 'locked' ? (
              <Btn size="sm" onClick={() => setMode('unlock')} disabled={!!busy}>
                &lt; BACK
              </Btn>
            ) : (
              <Btn size="sm" onClick={logout} disabled={!!busy}>
                LOG OFF
              </Btn>
            )}
            <Btn onClick={cancel} disabled={!!busy}>
              LATER
            </Btn>
          </div>
        </div>
      )}
    </Dialog>
  );
}
