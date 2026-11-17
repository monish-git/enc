import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import MenuBar from '../components/MenuBar.jsx';
import Navbar from '../components/Navbar.jsx';
import Sidebar from '../components/Sidebar.jsx';
import StatusBar from '../components/StatusBar.jsx';
import { Btn, Dialog } from '../components/ui.jsx';
import PixelIcon from '../components/PixelIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { exportBackup } from '../services/keyManager.js';
import { downloadBlob } from '../utils/format.js';

function BackupPrompt({ onClose }) {
  const { user } = useAuth();
  const ui = useUI();
  const save = () => {
    try {
      downloadBlob(new Blob([exportBackup(user.id)], { type: 'application/json' }), `ecn-key-backup-${user.username}.json`);
      ui.toast('KEY BACKUP SAVED. KEEP IT SOMEWHERE SAFE.');
      onClose();
    } catch (e) {
      ui.toast(e.message, 'error');
    }
  };
  return (
    <Dialog title="Back Up Your Key" icon="key" onClose={onClose} width={460} footer={<><Btn variant="primary" onClick={save}>SAVE BACKUP</Btn><Btn onClick={onClose}>LATER</Btn></>}>
      <div className="flex gap-3">
        <PixelIcon name="key" size={32} />
        <div>
          <p className="font-bold">WELCOME TO ECN, {user.username.toUpperCase()}.</p>
          <p className="mt-1">Your private key exists only in this browser. If you clear your browser data or switch devices, you need a backup to read your old messages.</p>
          <p className="mt-1 dim">The backup file is encrypted with your password. You can also make one later in the Security Center.</p>
        </div>
      </div>
    </Dialog>
  );
}

// Main application window content: menu bar, top navigation, folders sidebar, page area, status bar.
export default function Dashboard() {
  const { keyStatus } = useAuth();
  const ui = useUI();
  const loc = useLocation();
  const [sideOpen, setSideOpen] = useState(false);
  const [backup, setBackup] = useState(() => {
    try {
      return sessionStorage.getItem('ecn.newAccount') === '1';
    } catch {
      return false;
    }
  });

  // After a page reload the key is locked again: ask for the password straight away.
  useEffect(() => {
    if (keyStatus === 'locked' || keyStatus === 'missing') ui.ensureUnlocked();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSideOpen(false), [loc.pathname]);
  useEffect(() => {
    try {
      sessionStorage.removeItem('ecn.newAccount');
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <MenuBar />
      <Navbar onToggleSidebar={() => setSideOpen((o) => !o)} sidebarOpen={sideOpen} />
      <div className="flex flex-1 min-h-0 relative">
        <Sidebar open={sideOpen} onNavigate={() => setSideOpen(false)} />
        {sideOpen && <div className="md:hidden absolute inset-0 z-20" onClick={() => setSideOpen(false)} aria-hidden="true" />}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col m-1 ml-0 max-md:ml-1 sunken" style={{ background: 'var(--face)' }} id="main">
          {keyStatus !== 'unlocked' && keyStatus !== 'none' && (
            <div className="m-1.5 p-1.5 raised flex items-center gap-2 flex-wrap" role="status">
              <PixelIcon name="lock" size={16} />
              <span className="flex-1 min-w-[180px] font-bold">{keyStatus === 'missing' ? 'NO PRIVATE KEY ON THIS DEVICE - MESSAGES CANNOT BE ENCRYPTED OR DECRYPTED.' : 'KEYS LOCKED - MESSAGES STAY ENCRYPTED.'}</span>
              <Btn size="sm" onClick={() => ui.ensureUnlocked()}>
                {keyStatus === 'missing' ? 'SET UP KEY' : 'UNLOCK'}
              </Btn>
            </div>
          )}
          <div className="flex-1 min-h-0 flex flex-col">
            <Outlet />
          </div>
        </main>
      </div>
      <StatusBar />
      {backup && <BackupPrompt onClose={() => setBackup(false)} />}
    </div>
  );
}
