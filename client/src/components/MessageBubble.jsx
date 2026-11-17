import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MessageDropdown from './MessageDropdown.jsx';
import DecryptionAnimation from './DecryptionAnimation.jsx';
import { EncryptionDetailsDialog, ReportDialog } from './MessageDialogs.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { decryptMessage } from '../services/encryption.js';
import { b64decode } from '../services/crypto.js';
import * as km from '../services/keyManager.js';
import { clog } from '../services/clientLog.js';
import { copyText, downloadBlob, fmtBytes, fmtStamp, safeFilename } from '../utils/format.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP_TEXT = { ECDH: 'X25519 KEY AGREEMENT ... OK', HKDF: 'HKDF-SHA256 KEY DERIVATION ... OK', GCM: 'AES-256-GCM TAG VERIFY ... OK' };
const IMG = /^image\/(png|jpeg|gif|webp)$/;
const DELIVERY = { sent: '✓ SENT', delivered: '✓✓ DELIVERED', read: '✓✓ READ' };

function Attachment({ file }) {
  const bytes = useMemo(() => {
    try {
      return b64decode(file.data);
    } catch {
      return null;
    }
  }, [file]);
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!bytes || !IMG.test(file.type)) return undefined;
    const u = URL.createObjectURL(new Blob([bytes], { type: file.type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes, file.type]);
  if (!bytes) return <div className="msg-error">ATTACHMENT IS CORRUPTED</div>;
  return (
    <div className="msg-attach">
      <div className="min-w-0 flex-1">
        <div className="font-bold break-all">{safeFilename(file.name)}</div>
        <div>{fmtBytes(bytes.length)}</div>
        {url && <img src={url} alt={`Attachment ${safeFilename(file.name)}`} />}
      </div>
      <button type="button" className="msg-btn" onClick={() => downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), safeFilename(file.name))}>
        SAVE
      </button>
    </div>
  );
}

function MessageBubble({ message, mine, peer, hideToken, marked }) {
  const { user } = useAuth();
  const ui = useUI();
  const [view, setView] = useState('encrypted'); // encrypted | working | revealing | decrypted | error
  const [steps, setSteps] = useState([]);
  const [payload, setPayload] = useState(null);
  const [err, setErr] = useState(null);
  const [details, setDetails] = useState(false);
  const [report, setReport] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const hide = useCallback(() => {
    setPayload(null);
    setErr(null);
    setSteps([]);
    setView('encrypted');
  }, []);

  // Locking the keys (manually or by inactivity) immediately re-hides every decrypted message.
  useEffect(() => km.subscribe(() => !km.isUnlocked() && hide()), [hide]);
  useEffect(() => {
    if (hideToken) hide();
  }, [hideToken, hide]);

  const decrypt = useCallback(async () => {
    if (view === 'working' || view === 'revealing' || view === 'decrypted') return;
    if (!(await ui.ensureUnlocked())) return;
    // Authenticate the request: optionally re-enter the password every time.
    if (user.settings.requirePasswordToDecrypt) {
      const ok = await ui.authenticate({ title: 'Authenticate Decryption', message: 'Re-enter your password to decrypt this message.' });
      if (!ok) return;
    }
    if (!peer) {
      setErr({ code: 'NO_PEER', text: 'THE OTHER PARTY\'S ACCOUNT IS NO LONGER AVAILABLE' });
      setView('error');
      return;
    }
    setErr(null);
    setSteps([]);
    setView('working');
    try {
      const [plain] = await Promise.all([
        decryptMessage({ message, me: user, peer, onStep: (s) => alive.current && setSteps((x) => [...x, s]) }),
        sleep(520), // let the terminal steps be readable; decryption itself is already done
      ]);
      if (!alive.current) return;
      setPayload(plain);
      setView('revealing');
      ui.play('decrypt');
      clog('MESSAGE DECRYPTED');
    } catch (e) {
      if (!alive.current) return;
      setErr({ code: e.code || 'ERROR', text: e.message || 'DECRYPTION FAILED' });
      setView('error');
      clog(`DECRYPTION FAILED (${e.code || 'ERROR'})`, 'warn');
      ui.play('error');
    }
  }, [view, ui, user, message, peer]);

  const copy = async () => {
    const ok = await copyText(message.ciphertext);
    ui.toast(ok ? 'ENCRYPTED TEXT COPIED TO CLIPBOARD' : 'COPY FAILED - SELECT THE TEXT MANUALLY', ok ? 'info' : 'error');
  };

  const name = (mine ? peer?.username : peer?.username) || 'UNKNOWN';
  const decrypted = view === 'revealing' || view === 'decrypted';
  const statusLabel = view === 'working' ? 'DECRYPTING' : decrypted ? 'DECRYPTED' : view === 'error' ? (err?.code === 'AUTH_FAILED' ? 'TAMPERED' : 'ERROR') : 'ENCRYPTED';
  const ct = message.ciphertext;

  return (
    <article className={`msg ${mine ? 'mine' : 'theirs'} ${marked ? 'mark' : ''}`} aria-label={`${mine ? 'Sent' : 'Received'} message, ${statusLabel.toLowerCase()}`} data-status={statusLabel}>
      <div className="msg-top">
        <div className="msg-title">{mine ? 'MESSAGE SENT' : 'MESSAGE RECEIVED'}</div>
        {!decrypted && view !== 'working' && (
          <button type="button" className="msg-btn" onClick={decrypt}>
            DECRYPT
          </button>
        )}
        {decrypted && (
          <button type="button" className="msg-btn" onClick={hide}>
            HIDE
          </button>
        )}
        <MessageDropdown
          decrypted={decrypted}
          busy={view === 'working'}
          canReport={!mine}
          onDecrypt={decrypt}
          onHide={hide}
          onCopy={copy}
          onDetails={() => setDetails(true)}
          onReport={() => setReport(true)}
        />
      </div>
      <div className="msg-rule" aria-hidden="true">{'-'.repeat(80)}</div>
      <div className="msg-meta">
        {mine ? 'TO' : 'FROM'}: {name.toUpperCase()}
        {'\n'}TIME: {fmtStamp(message.createdAt)}
        {'\n'}STATUS: <span className="status-tag" data-s={statusLabel}>{statusLabel}</span>
        {mine && <span>{'  '}{DELIVERY[message.status] || ''}</span>}
      </div>

      <div className="msg-label">{decrypted ? 'PLAINTEXT:' : 'CIPHERTEXT:'}</div>
      {view === 'revealing' && <DecryptionAnimation plain={payload.text || ' '} onDone={() => alive.current && setView('decrypted')} />}
      {view === 'decrypted' && payload.text && <div className="plain">{payload.text}</div>}
      {decrypted && !payload.text && !payload.file && <div className="plain dim">(empty message)</div>}
      {decrypted && payload.file && <Attachment file={payload.file} />}

      {!decrypted && (
        <div className="cipher" aria-label="Ciphertext">
          {ct.length > 160 ? `${ct.slice(0, 160)}...` : ct}
        </div>
      )}

      {view === 'working' && (
        <div className="decrypt-steps" role="status">
          {['ECDH', 'HKDF', 'GCM'].map((s) => (
            <div key={s}>&gt; {steps.includes(s) ? STEP_TEXT[s] : `${STEP_TEXT[s].replace('OK', '')}...`}</div>
          ))}
        </div>
      )}
      {view === 'error' && (
        <div className="msg-error" role="alert">
          &gt; ERROR: {err?.text}
          {'\n'}&gt; THE MESSAGE REMAINS ENCRYPTED.
        </div>
      )}
      <div className="msg-rule" aria-hidden="true">{'-'.repeat(80)}</div>

      {details && <EncryptionDetailsDialog message={message} verified={decrypted} onClose={() => setDetails(false)} />}
      {report && <ReportDialog message={message} onClose={() => setReport(false)} />}
    </article>
  );
}

export default memo(MessageBubble);
