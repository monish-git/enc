import { useState } from 'react';
import { Link } from 'react-router-dom';
import { THEME_LIST } from '../components/MenuBar.jsx';
import { Btn, Check, Field, Group, Label, Select, Tabs } from '../components/ui.jsx';
import PixelIcon from '../components/PixelIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { errMsg } from '../services/api.js';
import { passwordScore } from '../utils/format.js';
import { playSound } from '../services/sound.js';

// [desktop, window, title] colours for the theme swatches
const SWATCH = {
  win95: ['#008080', '#D4D0C8', '#000080'],
  win98: ['#3a6ea5', '#C0C0C0', '#1084d0'],
  desert: ['#c9a66b', '#ebe0c0', '#7a3b12'],
  hacker: ['#000000', '#0b140b', '#006b00'],
  amber: ['#0a0600', '#1a1000', '#8a5600'],
  contrast: ['#000000', '#000000', '#ffff00'],
};
const LEVELS = ['TOO WEAK', 'WEAK', 'FAIR', 'GOOD', 'STRONG'];

function Profile() {
  const { user, saveSettings } = useAuth();
  const ui = useUI();
  const [status, setStatus] = useState(user.statusMessage || '');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveSettings({ statusMessage: status });
      ui.toast('PROFILE SAVED');
    } catch (ex) {
      ui.toast(errMsg(ex), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3 max-w-md">
      <div className="flex items-center gap-3">
        <PixelIcon name="user" size={48} />
        <div>
          <div className="font-bold text-[14px]">{user.username.toUpperCase()}</div>
          <div className="dim">Member since {new Date(user.createdAt).toLocaleDateString()}</div>
        </div>
      </div>
      <div>
        <Label htmlFor="pf-u">USER ID:</Label>
        <Field id="pf-u" value={user.username} readOnly disabled />
      </div>
      <div>
        <Label htmlFor="pf-e">EMAIL:</Label>
        <Field id="pf-e" value={user.email} readOnly disabled />
      </div>
      <div>
        <Label htmlFor="pf-s">STATUS MESSAGE (visible to contacts):</Label>
        <Field id="pf-s" value={status} onChange={(e) => setStatus(e.target.value)} maxLength={80} />
      </div>
      <div>
        <Btn variant="primary" type="submit" disabled={busy || status === (user.statusMessage || '')}>
          {busy ? 'SAVING...' : 'SAVE PROFILE'}
        </Btn>
      </div>
    </form>
  );
}

function Appearance() {
  const { user, saveSettings } = useAuth();
  const ui = useUI();
  const s = user.settings;
  const set = (patch) => saveSettings(patch).catch((e) => ui.toast(errMsg(e), 'error'));
  return (
    <div className="flex flex-col gap-3">
      <Group legend="Theme">
        <div role="radiogroup" aria-label="Theme" className="grid gap-2 grid-cols-2 md:grid-cols-3">
          {THEME_LIST.map(([id, name]) => (
            <button key={id} type="button" role="radio" aria-checked={s.theme === id} onClick={() => set({ theme: id })} className={`btn !justify-start !items-start flex-col !gap-1 ${s.theme === id ? 'pressed' : ''}`}>
              <span className="flex w-full h-8" style={{ boxShadow: 'inset 0 0 0 1px #000' }} aria-hidden="true">
                <span className="flex-1" style={{ background: SWATCH[id][0] }} />
                <span className="flex-1" style={{ background: SWATCH[id][1] }} />
                <span className="flex-1" style={{ background: SWATCH[id][2] }} />
              </span>
              <span className="font-bold">{s.theme === id ? '● ' : '○ '}{name}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group legend="Display">
        <div className="flex flex-col gap-2">
          <Check checked={s.crt} onChange={(v) => set({ crt: v })} label="Dark CRT terminal mode" hint="(green phosphor, glow, vignette)" />
          <Check checked={s.scanlines} onChange={(v) => set({ scanlines: v })} label="CRT scanlines" hint="(subtle overlay)" />
        </div>
      </Group>
      <Group legend="Sound">
        <Check
          checked={s.sound}
          onChange={(v) => {
            set({ sound: v });
            if (v) setTimeout(() => playSound('receive'), 80);
          }}
          label="Sound effects"
          hint="(beeps for send, receive, decrypt, lock)"
        />
      </Group>
    </div>
  );
}

function Privacy() {
  const { user, saveSettings } = useAuth();
  const ui = useUI();
  const s = user.settings;
  const set = (patch) => saveSettings(patch).catch((e) => ui.toast(errMsg(e), 'error'));
  return (
    <div className="flex flex-col gap-3 max-w-lg">
      <Group legend="Messaging">
        <Check checked={s.previewBeforeSend} onChange={(v) => set({ previewBeforeSend: v })} label="Show encryption preview before sending" />
      </Group>
      <Group legend="Decryption">
        <div className="flex flex-col gap-2">
          <Check checked={s.requirePasswordToDecrypt} onChange={(v) => set({ requirePasswordToDecrypt: v })} label="Require my password for every decryption" hint="(extra protection if someone uses your unlocked screen)" />
          <div>
            <Label htmlFor="al">AUTO-LOCK KEYS AFTER INACTIVITY:</Label>
            <Select id="al" value={s.autoLockMinutes} onChange={(e) => set({ autoLockMinutes: Number(e.target.value) })} className="!w-auto">
              <option value={0}>Never</option>
              <option value={1}>1 minute</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={240}>4 hours</option>
            </Select>
            <div className="dim mt-0.5">Locking wipes the key from memory and re-hides all decrypted text.</div>
          </div>
        </div>
      </Group>
      <div>
        Keys, backups and sessions are managed in the{' '}
        <Link to="/security" className="link">
          Security Center
        </Link>
        .
      </div>
    </div>
  );
}

function Password() {
  const { changePassword } = useAuth();
  const ui = useUI();
  const [f, setF] = useState({ cur: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const score = passwordScore(f.next);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (f.next !== f.confirm) return setErr('NEW PASSWORDS DO NOT MATCH');
    if (f.next.length < 10) return setErr('PASSWORD MUST BE AT LEAST 10 CHARACTERS');
    setBusy(true);
    try {
      const r = await changePassword(f.cur, f.next);
      ui.toast(`PASSWORD CHANGED. ${r.revokedSessions} OTHER SESSION(S) SIGNED OUT.${r.rewrapped ? '' : ' NOTE: YOUR LOCAL KEY WAS NOT RE-WRAPPED.'}`);
      setF({ cur: '', next: '', confirm: '' });
    } catch (ex) {
      setErr(errMsg(ex));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 max-w-md">
      <p className="dim">Your account password also protects the private key stored in this browser; both are updated together.</p>
      <div>
        <Label htmlFor="pw-c">CURRENT PASSWORD:</Label>
        <Field id="pw-c" type="password" autoComplete="current-password" value={f.cur} onChange={(e) => setF({ ...f, cur: e.target.value })} maxLength={128} required />
      </div>
      <div>
        <Label htmlFor="pw-n">NEW PASSWORD:</Label>
        <Field id="pw-n" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} maxLength={128} required />
        <div className="flex items-center gap-2 mt-1">
          <div className="meter flex-1" data-level={score} aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <i key={n} className={score >= n ? 'on' : ''} />
            ))}
          </div>
          <span className="w-[70px]">{f.next ? LEVELS[score] : ''}</span>
        </div>
      </div>
      <div>
        <Label htmlFor="pw-r">CONFIRM NEW PASSWORD:</Label>
        <Field id="pw-r" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} maxLength={128} required />
      </div>
      {err && <div role="alert" className="font-bold">ERROR: {err}</div>}
      <div>
        <Btn variant="primary" type="submit" disabled={busy || !f.cur || !f.next || !f.confirm}>
          {busy ? 'CHANGING...' : 'CHANGE PASSWORD'}
        </Btn>
      </div>
    </form>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('profile');
  const panels = { profile: <Profile />, appearance: <Appearance />, privacy: <Privacy />, password: <Password /> };
  return (
    <div className="flex flex-col flex-1 min-h-0 p-2">
      <Tabs
        label="Settings sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'profile', label: 'Profile' },
          { id: 'appearance', label: 'Appearance' },
          { id: 'privacy', label: 'Privacy & Security' },
          { id: 'password', label: 'Password' },
        ]}
      />
      <div className="tabpanel flex-1 min-h-0 overflow-auto" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {panels[tab]}
      </div>
    </div>
  );
}
