import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { fmtDate } from '../utils/format.js';

export default function StatusBar() {
  const { user, keyStatus } = useAuth();
  const { connected, unread } = useData();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const keyText = { unlocked: 'KEYS UNLOCKED', locked: 'KEYS LOCKED', missing: 'NO KEY ON THIS DEVICE', none: '' }[keyStatus];

  return (
    <footer className="statusbar" role="contentinfo">
      <div className="sb-panel flex-1 min-w-0">{connected ? 'READY' : 'CONNECTING TO SERVER...'}</div>
      <div className="sb-panel hidden sm:flex">UNREAD: {unread}</div>
      <div className="sb-panel hidden md:flex">{keyText}</div>
      <div className="sb-panel hidden lg:flex">USER: {user.username.toUpperCase()}</div>
      <div className="sb-panel hidden sm:flex">{fmtDate(now)}</div>
    </footer>
  );
}
