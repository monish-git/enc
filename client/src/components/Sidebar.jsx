import { NavLink } from 'react-router-dom';
import PixelIcon from './PixelIcon.jsx';
import { useData } from '../context/DataContext.jsx';

export default function Sidebar({ open, onNavigate }) {
  const { unread, incomingRequests, alerts } = useData();

  const items = [
    { to: '/inbox', label: 'Inbox', icon: 'inbox', badge: unread },
    { to: '/sent', label: 'Sent Messages', icon: 'sent' },
    { to: '/contacts', label: 'Contacts', icon: 'contacts', badge: incomingRequests, badgeTitle: 'pending requests' },
    { to: '/new', label: 'New Conversation', icon: 'newchat' },
    { to: '/archived', label: 'Archived Messages', icon: 'archive' },
    { to: '/security', label: 'Security Center', icon: 'shield', badge: alerts, badgeTitle: 'unread alerts' },
  ];

  return (
    <nav
      aria-label="Folders"
      className={`${open ? 'flex' : 'hidden'} md:flex flex-col gap-1 w-[190px] shrink-0 p-1.5 z-30 max-md:absolute max-md:left-0 max-md:top-0 max-md:bottom-0 max-md:raised max-md:shadow-[4px_4px_0_rgba(0,0,0,.35)]`}
    >
      <div className="font-bold px-1 flex items-center gap-1">
        <PixelIcon name="folder" size={16} /> ECN Folders
      </div>
      <div className="list flex-1 min-h-0 p-1 flex flex-col gap-px" style={{ background: 'var(--field)' }}>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} onClick={onNavigate} className={({ isActive }) => `row ${isActive ? 'sel' : ''}`} end={false}>
            <PixelIcon name={it.icon} size={16} />
            <span className="flex-1 truncate" style={{ fontWeight: it.badge ? 700 : 400 }}>
              {it.label}
            </span>
            {it.badge > 0 && (
              <span className="badge" title={`${it.badge} ${it.badgeTitle || 'unread'}`} aria-label={`${it.badge} ${it.badgeTitle || 'unread'}`}>
                {it.badge > 99 ? '99+' : it.badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>
      <div className="etched p-2 text-[11px] leading-snug">
        <div className="font-bold font-term text-[18px] leading-none">CONNECT.</div>
        <div className="font-bold font-term text-[18px] leading-none">ENCRYPT.</div>
        <div className="font-bold font-term text-[18px] leading-none mb-1">COMMUNICATE.</div>
        <div className="dim">Messages are encrypted by default. Only you decide when to reveal them.</div>
      </div>
    </nav>
  );
}
