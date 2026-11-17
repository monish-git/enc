import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Btn, Dialog, Dropdown } from './ui.jsx';
import PixelIcon from './PixelIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';

export const THEME_LIST = [
  ['win95', 'Windows 95'],
  ['win98', 'Windows 98'],
  ['desert', 'Desert'],
  ['hacker', 'Hacker Green'],
  ['amber', 'Amber Monitor'],
  ['contrast', 'High Contrast'],
];

function About({ onClose }) {
  return (
    <Dialog title="About ECN" icon="computer" onClose={onClose} width={440} footer={<Btn variant="primary" onClick={onClose}>OK</Btn>}>
      <div className="flex gap-3">
        <PixelIcon name="computer" size={48} />
        <div className="min-w-0">
          <div className="font-bold">ECN - ENCRYPTED COMMUNICATION NETWORK</div>
          <div>Version 1.0</div>
          <div className="my-1 font-bold">CONNECT. ENCRYPT. COMMUNICATE.</div>
          <div className="hr" />
          <p>Messages are encrypted by default. Only you decide when to reveal them.</p>
          <ul className="mt-2 list-disc pl-5">
            <li>Key agreement: X25519 (Web Crypto)</li>
            <li>Key derivation: HKDF-SHA-256, new salt per message</li>
            <li>Cipher: AES-256-GCM, unique 96-bit IV, 128-bit tag</li>
            <li>Private keys never leave your browser</li>
            <li>The server stores ciphertext only</li>
          </ul>
        </div>
      </div>
    </Dialog>
  );
}

export default function MenuBar() {
  const nav = useNavigate();
  const { user, keyStatus, lockKeys, logout, saveSettings } = useAuth();
  const ui = useUI();
  const [about, setAbout] = useState(false);
  const s = user.settings;

  const set = (patch) => saveSettings(patch).catch((e) => ui.toast(e.message, 'error'));

  const menus = {
    File: [
      { label: 'New Conversation', icon: 'newchat', onSelect: () => nav('/new') },
      { label: 'Find Contacts', icon: 'contacts', onSelect: () => nav('/contacts?tab=find') },
      { sep: true },
      keyStatus === 'unlocked'
        ? { label: 'Lock Keys', icon: 'lock', onSelect: lockKeys }
        : { label: 'Unlock Keys...', icon: 'unlock', onSelect: () => ui.ensureUnlocked() },
      { label: 'Settings', icon: 'gear', onSelect: () => nav('/settings') },
      { sep: true },
      { label: 'Log Off', icon: 'user', onSelect: logout },
    ],
    View: [
      ...THEME_LIST.map(([id, name]) => ({ label: name, check: s.theme === id, onSelect: () => set({ theme: id }) })),
      { sep: true },
      { label: 'Dark CRT Terminal Mode', check: s.crt, onSelect: () => set({ crt: !s.crt }) },
      { label: 'CRT Scanlines', check: s.scanlines, onSelect: () => set({ scanlines: !s.scanlines }) },
      { label: 'Sound Effects', check: s.sound, onSelect: () => set({ sound: !s.sound }) },
    ],
    Help: [
      { label: 'Security Center', icon: 'shield', onSelect: () => nav('/security') },
      { sep: true },
      { label: 'About ECN...', icon: 'info', onSelect: () => setAbout(true) },
    ],
  };

  return (
    <>
      <div className="menubar" role="menubar" aria-label="Application menu">
        {Object.entries(menus).map(([name, items]) => (
          <Dropdown
            key={name}
            menuLabel={name}
            items={items}
            renderTrigger={({ open, ...p }) => (
              <button type="button" role="menuitem" className="menubar-btn" {...p}>
                {name}
              </button>
            )}
          />
        ))}
      </div>
      {about && <About onClose={() => setAbout(false)} />}
    </>
  );
}
