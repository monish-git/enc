import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { Btn, Field, Label, PixelBar } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCryptoSupport } from '../hooks/useCryptoSupport.js';
import { errMsg } from '../services/api.js';
import { playSound } from '../services/sound.js';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const support = useCryptoSupport();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(identifier.trim(), password);
      nav(loc.state?.from && loc.state.from !== '/login' ? loc.state.from : '/inbox', { replace: true });
    } catch (ex) {
      playSound('error');
      setError(errMsg(ex));
      setPassword('');
      setBusy(false);
    }
  };

  const status = busy ? 'AUTHENTICATING...' : error ? `ACCESS DENIED - ${error}` : !support.ok ? `CRYPTO ERROR - ${support.reason}` : 'READY';

  return (
    <AuthShell title="ECN - Log On" width={440}>
      <div className="logon-head mb-3">
        <div style={{ fontSize: 30 }}>ECN SECURE TERMINAL</div>
        <div className="tag">----------------------------</div>
        <div>CONNECT. ENCRYPT. COMMUNICATE.</div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2.5" aria-label="Log on">
        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
          <Label htmlFor="li-id" className="!mb-0 font-bold">
            USER ID:
          </Label>
          <Field id="li-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={busy} placeholder="username or email" data-autofocus autoFocus />
          <Label htmlFor="li-pw" className="!mb-0 font-bold">
            PASSWORD:
          </Label>
          <Field id="li-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={128} required disabled={busy} />
        </div>

        {busy && <PixelBar label="VERIFYING CREDENTIALS" />}

        <div className="flex gap-2 justify-center flex-wrap">
          <Btn variant="primary" type="submit" disabled={busy || !support.ok || !identifier || !password}>
            LOGIN
          </Btn>
          <Link to="/register" className="btn" aria-disabled={busy} onClick={(e) => busy && e.preventDefault()}>
            CREATE ACCOUNT
          </Link>
        </div>

        <div className={`logon-status ${error ? 'err' : busy ? 'busy' : ''}`} role={error ? 'alert' : 'status'}>
          SYSTEM STATUS: {status}
        </div>
      </form>
      <p className="dim mt-2 text-center">Messages are encrypted by default. Only you decide when to reveal them.</p>
    </AuthShell>
  );
}
