import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { Btn, Check, Field, Label, PixelBar } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCryptoSupport } from '../hooks/useCryptoSupport.js';
import { errMsg } from '../services/api.js';
import { passwordScore } from '../utils/format.js';
import { playSound } from '../services/sound.js';

const LEVELS = ['TOO WEAK', 'WEAK', 'FAIR', 'GOOD', 'STRONG'];

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const support = useCryptoSupport();
  const [f, setF] = useState({ username: '', email: '', password: '', confirm: '' });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const score = passwordScore(f.password);
  const userOk = /^[a-z0-9_]{3,20}$/.test(f.username);
  const mismatch = f.confirm && f.confirm !== f.password;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!userOk) return setError('USERNAME: 3-20 CHARACTERS, a-z 0-9 AND UNDERSCORE ONLY');
    if (f.password.length < 10) return setError('PASSWORD MUST BE AT LEAST 10 CHARACTERS');
    if (f.password !== f.confirm) return setError('PASSWORDS DO NOT MATCH');
    setBusy(true);
    try {
      await register({ username: f.username, email: f.email.trim(), password: f.password });
      nav('/inbox', { replace: true, state: { newAccount: true } });
    } catch (ex) {
      playSound('error');
      setError(errMsg(ex));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="ECN - Create Account" icon="user" width={500}>
      <div className="logon-head mb-3">
        <div style={{ fontSize: 28 }}>NEW USER REGISTRATION</div>
        <div className="tag">----------------------------</div>
        <div>KEYS ARE GENERATED IN YOUR BROWSER</div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2.5" aria-label="Create account">
        <div className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-2">
          <Label htmlFor="rg-u" className="!mb-0 font-bold">
            USER ID:
          </Label>
          <div>
            <Field id="rg-u" value={f.username} onChange={(e) => setF((x) => ({ ...x, username: e.target.value.toLowerCase() }))} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20} required disabled={busy} data-autofocus autoFocus />
            <div className="dim">3-20 chars: a-z, 0-9, _</div>
          </div>
          <Label htmlFor="rg-e" className="!mb-0 font-bold">
            EMAIL:
          </Label>
          <Field id="rg-e" type="email" value={f.email} onChange={set('email')} autoComplete="email" maxLength={254} required disabled={busy} />
          <Label htmlFor="rg-p" className="!mb-0 font-bold">
            PASSWORD:
          </Label>
          <div>
            <Field id="rg-p" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" maxLength={128} required disabled={busy} aria-describedby="pw-meter" />
            <div id="pw-meter" className="flex items-center gap-2 mt-1">
              <div className="meter flex-1" data-level={score} aria-hidden="true">
                {[1, 2, 3, 4].map((n) => (
                  <i key={n} className={score >= n ? 'on' : ''} />
                ))}
              </div>
              <span className="w-[70px]">{f.password ? LEVELS[score] : ''}</span>
            </div>
          </div>
          <Label htmlFor="rg-c" className="!mb-0 font-bold">
            CONFIRM:
          </Label>
          <div>
            <Field id="rg-c" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" maxLength={128} required disabled={busy} />
            {mismatch && <div className="font-bold">PASSWORDS DO NOT MATCH</div>}
          </div>
        </div>

        <div className="etched p-2">
          <Check checked={ack} onChange={setAck} disabled={busy} label="I understand that my private key is created in this browser and never sent to ECN. If I lose both this device and my key backup, my old messages cannot be recovered." />
        </div>

        {busy && <PixelBar label="GENERATING X25519 KEY PAIR AND WRAPPING IT (PBKDF2 600,000 ROUNDS)" />}

        <div className="flex gap-2 justify-center flex-wrap">
          <Btn variant="primary" type="submit" disabled={busy || !ack || !support.ok}>
            CREATE ACCOUNT
          </Btn>
          <Link to="/login" className="btn" aria-disabled={busy} onClick={(e) => busy && e.preventDefault()}>
            BACK TO LOGIN
          </Link>
        </div>

        <div className={`logon-status ${error ? 'err' : busy ? 'busy' : ''}`} role={error ? 'alert' : 'status'}>
          SYSTEM STATUS: {busy ? 'CREATING SECURE IDENTITY...' : error ? `ERROR - ${error}` : !support.ok ? `CRYPTO ERROR - ${support.reason}` : 'READY'}
        </div>
      </form>
    </AuthShell>
  );
}
