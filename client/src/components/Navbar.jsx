import { useNavigate } from 'react-router-dom';
import { Dropdown, Lamp } from './ui.jsx';
import PixelIcon from './PixelIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useUI } from '../context/UIContext.jsx';

export default function Navbar({ onToggleSidebar, sidebarOpen }) {
  const nav = useNavigate();
  const { user, keyStatus, lockKeys, logout } = useAuth();
  const { connected } = useData();
  const ui = useUI();

  const unlocked = keyStatus === 'unlocked';
  const profileItems = [
    { label: 'Profile & Settings', icon: 'user', onSelect: () => nav('/settings') },
    { label: 'Security Center', icon: 'shield', onSelect: () => nav('/security') },
    { sep: true },
    unlocked ? { label: 'Lock Keys', icon: 'lock', onSelect: lockKeys } : { label: 'Unlock Keys...', icon: 'unlock', onSelect: () => ui.ensureUnlocked() },
    { label: 'Log Off', icon: 'user', onSelect: logout },
  ];

  return (
    <header className="flex items-center gap-2 px-1.5 py-1 flex-wrap sm:flex-nowrap" style={{ boxShadow: '0 1px 0 var(--lo), 0 2px 0 var(--hi)', marginBottom: 3 }}>
      <button type="button" className="btn icon md:hidden" onClick={onToggleSidebar} aria-label="Toggle folders" aria-expanded={!!sidebarOpen}>
        ☰
      </button>

      <button type="button" className="tool" onClick={() => nav('/inbox')} aria-label="ECN home">
        <PixelIcon name="computer" size={24} />
        <span className="font-term text-[26px] leading-none tracking-wide">ECN</span>
      </button>
      <h1 className="font-bold hidden lg:block tracking-wide m-0 text-[12px] truncate">ENCRYPTED COMMUNICATION NETWORK</h1>

      <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
        <div className="sb-panel" role="status" aria-label={connected ? 'Connection online' : 'Connection offline'}>
          <Lamp state={connected ? 'on' : 'bad'} />
          <b>{connected ? 'ONLINE' : 'OFFLINE'}</b>
        </div>

        <button
          type="button"
          className="sb-panel"
          style={{ background: 'transparent', cursor: 'default' }}
          onClick={() => (unlocked ? lockKeys() : ui.ensureUnlocked())}
          title={unlocked ? 'Encryption active - click to lock keys' : 'Keys locked - click to unlock'}
        >
          <PixelIcon name={unlocked ? 'unlock' : 'lock'} size={14} />
          <b className="hidden sm:inline">{unlocked ? 'E2EE: AES-256-GCM' : keyStatus === 'missing' ? 'NO KEY' : 'KEYS LOCKED'}</b>
          <b className="sm:hidden">{unlocked ? 'E2EE' : 'LOCKED'}</b>
        </button>

        <Dropdown
          align="right"
          menuLabel="Profile"
          items={profileItems}
          renderTrigger={({ open, ...p }) => (
            <button type="button" className="tool" {...p}>
              <PixelIcon name="user" size={16} />
              <b>{user.username.toUpperCase()}</b> ▾
            </button>
          )}
        />

        <button type="button" className="btn icon" onClick={() => nav('/settings')} aria-label="Settings" title="Settings">
          <PixelIcon name="gear" size={14} />
        </button>
      </div>
    </header>
  );
}
