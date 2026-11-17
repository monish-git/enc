import { useEffect, useState } from 'react';
import { Btn, Dialog, Label, Select, TextArea } from './ui.jsx';
import { api, errMsg } from '../services/api.js';
import { describeCiphertext } from '../services/encryption.js';
import { enc, formatFingerprint, hex } from '../services/crypto.js';
import { fmtDateTime } from '../utils/format.js';
import { useUI } from '../context/UIContext.jsx';

function Row({ k, children, mono }) {
  return (
    <tr>
      <td className="whitespace-nowrap pr-3 align-top font-bold">{k}</td>
      <td className={`break-all ${mono ? 'font-mono text-[11px]' : ''}`}>{children}</td>
    </tr>
  );
}

export function EncryptionDetailsDialog({ message, verified, onClose }) {
  const d = describeCiphertext(message);
  return (
    <Dialog title="Encryption Details" icon="shield" onClose={onClose} width={560} footer={<Btn variant="primary" onClick={onClose}>CLOSE</Btn>}>
      <table className="w-full">
        <tbody>
          <Row k="CIPHER">{d.algorithm}</Row>
          <Row k="KEY AGREEMENT">{d.keyAgreement}</Row>
          <Row k="KEY DERIVATION">{d.kdf}</Row>
          <Row k="IV (96-bit)" mono>{d.ivBase64}</Row>
          <Row k="HKDF SALT" mono>{d.saltBase64}</Row>
          <Row k="AUTH TAG (128-bit)" mono>{d.authTagBase64}</Row>
          <Row k="CIPHERTEXT SIZE">{d.ciphertextBytes} bytes (+16 byte tag)</Row>
          <Row k="SENT">{fmtDateTime(message.createdAt)}</Row>
          <Row k="SENDER KEY" mono>{formatFingerprint(d.senderFp, 8)}</Row>
          <Row k="RECIPIENT KEY" mono>{formatFingerprint(d.recipientFp, 8)}</Row>
          <Row k="INTEGRITY">{verified ? 'VERIFIED - authentication tag matched during decryption' : 'NOT YET VERIFIED - decrypt the message to check the tag'}</Row>
          <Row k="MESSAGE ID" mono>{message.id}</Row>
        </tbody>
      </table>
      <div className="mt-3">
        <Label htmlFor="ed-ct">FULL CIPHERTEXT (base64):</Label>
        <TextArea id="ed-ct" readOnly rows={5} className="font-mono text-[11px]" value={message.ciphertext} onFocus={(e) => e.target.select()} />
      </div>
    </Dialog>
  );
}

export function ReportDialog({ message, onClose }) {
  const ui = useUI();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post(`/messages/${message.id}/report`, { reason, details });
      ui.toast('MESSAGE REPORTED. NO CONTENT WAS SHARED.');
      onClose();
    } catch (ex) {
      setErr(errMsg(ex));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Report Message" icon="warn" onClose={onClose} width={440}>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <p>
          Because messages are end-to-end encrypted, ECN <b>cannot read</b> this message. Only the message ID and your reason are recorded. Consider also blocking the contact.
        </p>
        <div>
          <Label htmlFor="rp-r">REASON:</Label>
          <Select id="rp-r" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="phishing">Phishing / scam</option>
            <option value="illegal">Illegal content</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="rp-d">DETAILS (optional, do not paste message text):</Label>
          <TextArea id="rp-d" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
        {err && <div role="alert" className="font-bold">ERROR: {err}</div>}
        <div className="flex gap-2 justify-end">
          <Btn variant="danger" type="submit" disabled={busy}>
            {busy ? 'SENDING...' : 'REPORT'}
          </Btn>
          <Btn onClick={onClose}>CANCEL</Btn>
        </div>
      </form>
    </Dialog>
  );
}

// Safety number = SHA-256 over both fingerprints (sorted) -> 30 digits, same on both sides.
async function safetyNumber(a, b) {
  const [x, y] = [a, b].sort();
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`ECN1-SAFETY|${x}|${y}`)));
  let digits = '';
  for (let i = 0; i < 15; i++) digits += String(((h[i * 2] << 8) | h[i * 2 + 1]) % 100000).padStart(5, '0').slice(0, 5);
  return digits.match(/.{1,5}/g).slice(0, 6).join(' ');
}

export function FingerprintDialog({ me, peer, trust, onAccept, onClose }) {
  const [sn, setSn] = useState('');
  useEffect(() => {
    safetyNumber(me.keyFingerprint, peer.keyFingerprint).then(setSn);
  }, [me.keyFingerprint, peer.keyFingerprint]);

  return (
    <Dialog
      title="Verify Encryption Keys"
      icon="key"
      onClose={onClose}
      width={520}
      footer={
        <>
          {trust === 'changed' && (
            <Btn variant="danger" onClick={onAccept}>
              TRUST NEW KEY
            </Btn>
          )}
          <Btn variant="primary" onClick={onClose}>
            CLOSE
          </Btn>
        </>
      }
    >
      {trust === 'changed' && (
        <div className="mb-3 p-2 raised font-bold" role="alert">
          WARNING: {peer.username.toUpperCase()}'S ENCRYPTION KEY HAS CHANGED SINCE YOU LAST TALKED. Verify the numbers below with them through another channel before trusting it. Sending is blocked until you do.
        </div>
      )}
      <p className="mb-2">Compare the safety number with {peer.username.toUpperCase()} in person or by phone. If it matches on both sides, nobody (including the server) is intercepting your messages.</p>
      <div className="term mb-3 text-center" style={{ fontSize: 26 }} aria-label="Safety number">
        {sn || '...'}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="font-bold mb-1">YOUR KEY</div>
          <div className="fp">{formatFingerprint(me.keyFingerprint, 16).split(' ').map((g, i) => <span key={i}>{g}</span>)}</div>
        </div>
        <div>
          <div className="font-bold mb-1">{peer.username.toUpperCase()}'S KEY</div>
          <div className="fp">{formatFingerprint(peer.keyFingerprint, 16).split(' ').map((g, i) => <span key={i}>{g}</span>)}</div>
        </div>
      </div>
    </Dialog>
  );
}

export function EncryptionPreview({ preview, sending, onSend, onCancel }) {
  const { original, fileName, out } = preview;
  const ct = out.ciphertext;
  return (
    <Dialog
      title="Encryption Preview"
      icon="lock"
      onClose={sending ? undefined : onCancel}
      dismissable={!sending}
      width={540}
      footer={
        <>
          <Btn variant="primary" onClick={onSend} disabled={sending} data-autofocus>
            {sending ? 'TRANSMITTING...' : 'TRANSMIT'}
          </Btn>
          <Btn onClick={onCancel} disabled={sending}>
            CANCEL
          </Btn>
        </>
      }
    >
      <div className="term" style={{ fontSize: 18 }}>
        <div className="dim">ORIGINAL MESSAGE:</div>
        <div className="term-line" style={{ maxHeight: 110, overflow: 'auto' }}>
          {original || '(no text)'}
          {fileName && <div className="dim">[ATTACHMENT: {fileName}]</div>}
        </div>
        <div className="mt-2 dim">ENCRYPTED OUTPUT:</div>
        <div className="cipher" style={{ maxHeight: 120, overflow: 'auto' }}>
          {ct.length > 420 ? `${ct.slice(0, 420)}...` : ct}
        </div>
        <div className="mt-2">
          ENCRYPTION STATUS: <span className="ok">SUCCESS.</span>
        </div>
        <div className="dim">
          {out.alg} | IV {out.iv.slice(0, 8)}... | SALT {out.salt.slice(0, 8)}... | {Math.round((ct.length * 3) / 4)} BYTES
        </div>
      </div>
      <p className="mt-2 dim">Only this ciphertext is sent to the server. The plaintext never leaves your browser.</p>
    </Dialog>
  );
}
