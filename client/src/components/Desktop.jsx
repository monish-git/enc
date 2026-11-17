import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TitleBar, Dropdown } from './ui.jsx';
import PixelIcon from './PixelIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { fmtHM } from '../utils/format.js';

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return <span>{fmtHM(now)}</span>;
}

function StartMenu({ onLogoff }) {
  const nav = useNavigate();
  const { keyStatus, lockKeys } = useAuth();
  const ui = useUI();
  const items = [
    { label: 'Inbox', icon: 'inbox', onSelect: () => nav('/inbox') },
    { label: 'Contacts', icon: 'contacts', onSelect: () => nav('/contacts') },
    { label: 'New Conversation', icon: 'newchat', onSelect: () => nav('/new') },
    { label: 'Security Center', icon: 'shield', onSelect: () => nav('/security') },
    { label: 'Settings', icon: 'gear', onSelect: () => nav('/settings') },
    { sep: true },
    keyStatus === 'unlocked'
      ? { label: 'Lock Keys', icon: 'lock', onSelect: lockKeys }
      : { label: 'Unlock Keys...', icon: 'unlock', onSelect: () => ui.ensureUnlocked() },
    { label: 'Log Off...', icon: 'user', onSelect: onLogoff },
  ];
  return (
    <Dropdown
      menuLabel="Start menu"
      items={items}
      renderTrigger={({ open, ...p }) => (
        <button type="button" className={`task-btn ${open ? 'active' : ''}`} {...p}>
          <PixelIcon name="computer" size={16} /> Start
        </button>
      )}
    />
  );
}

// The "operating system": teal desktop, classic window frame, taskbar. The ECN app lives in the window.
export default function Desktop({ children, tray }) {
  const nav = useNavigate();
  const loc = useLocation();
  const auth = useAuth();
  const ui = useUI();
  const [maximized, setMax] = useState(() => {
    try {
      return localStorage.getItem('ecn.max') !== '0';
    } catch {
      return true;
    }
  });
  const [minimized, setMin] = useState(false);

  const toggleMax = () =>
    setMax((m) => {
      try {
        localStorage.setItem('ecn.max', m ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !m;
    });

  const logoff = async () => {
    const ok = await ui.confirm({ title: 'Log Off ECN', message: 'Log off now?\nYour encryption keys will be locked and all decrypted text cleared from memory.', confirmLabel: 'LOG OFF' });
    if (ok) auth.logout();
  };

  const section = loc.pathname.split('/')[1] || 'inbox';
  const titles = { inbox: 'Inbox', sent: 'Sent Messages', contacts: 'Contacts', new: 'New Conversation', archived: 'Archived Messages', security: 'Security Center', settings: 'Settings' };

  return (
    <div className="desktop">
      <div className="desktop-area">
        {!maximized && !minimized && (
          <div className="desk-icons" aria-label="Desktop shortcuts">
            {[
              ['inbox', 'Inbox', '/inbox'],
              ['contacts', 'Contacts', '/contacts'],
              ['shield', 'Security Center', '/security'],
              ['gear', 'Settings', '/settings'],
            ].map(([icon, label, to]) => (
              <button key={to} type="button" className="desk-icon" onClick={() => nav(to)}>
                <PixelIcon name={icon} size={32} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        <div className={`appwin ${maximized ? 'max' : 'windowed'}`} style={{ display: minimized ? 'none' : 'flex' }}>
          <div className="win">
            <TitleBar
              title="ECN - Encrypted Communication Network"
              icon="computer"
              onMinimize={() => setMin(true)}
              onMaximize={toggleMax}
              onClose={logoff}
              maximized={maximized}
            />
            <div className="win-body flex flex-col min-h-0">{children}</div>
          </div>
        </div>
      </div>

      <div className="taskbar">
        <StartMenu onLogoff={logoff} />
        <span className="self-stretch" style={{ width: 2, boxShadow: 'inset 1px 0 var(--lo), inset -1px 0 var(--hi)' }} />
        <button type="button" className={`task-btn ${!minimized ? 'active' : ''}`} onClick={() => setMin((m) => !m)} aria-pressed={!minimized}>
          <PixelIcon name="computer" size={16} />
          <span className="truncate">ECN - {titles[section] || 'Inbox'}</span>
        </button>
        <div className="tray">
          {tray}
          <Clock />
        </div>
      </div>
    </div>
  );
}
