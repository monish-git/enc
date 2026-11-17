import { Component, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { FaLock, FaLockOpen, FaVolumeMute, FaVolumeUp, FaWifi } from 'react-icons/fa';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { UIProvider } from './context/UIContext.jsx';
import { DataProvider, useData } from './context/DataContext.jsx';
import AuthShell from './components/AuthShell.jsx';
import BootScreen from './components/BootScreen.jsx';
import Desktop from './components/Desktop.jsx';
import { Btn, Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Chat from './pages/Chat.jsx';
import Sent from './pages/Sent.jsx';
import Contacts from './pages/Contacts.jsx';
import NewConversation from './pages/NewConversation.jsx';
import SecurityCenter from './pages/SecurityCenter.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error('[ECN] UI crash:', error?.message);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <AuthShell title="ECN - Fatal Exception" icon="warn">
        <p className="font-bold">A FATAL EXCEPTION HAS OCCURRED.</p>
        <p className="mt-1 break-words">{String(this.state.error?.message || this.state.error)}</p>
        <p className="mt-2 dim">Your messages and keys are safe. Reload to continue.</p>
        <div className="mt-3">
          <Btn variant="primary" onClick={() => location.reload()}>
            RELOAD
          </Btn>
        </div>
      </AuthShell>
    );
  }
}

function Tray() {
  const { user, keyStatus, saveSettings } = useAuth();
  const { connected } = useData();
  const sound = user.settings.sound;
  return (
    <>
      <button type="button" className="tool !p-0.5" onClick={() => saveSettings({ sound: !sound }).catch(() => {})} aria-pressed={sound} aria-label={sound ? 'Mute sound effects' : 'Enable sound effects'} title={sound ? 'Sound on' : 'Sound off'}>
        {sound ? <FaVolumeUp size={13} /> : <FaVolumeMute size={13} />}
      </button>
      <span title={keyStatus === 'unlocked' ? 'Keys unlocked' : 'Keys locked'} aria-label={keyStatus === 'unlocked' ? 'Keys unlocked' : 'Keys locked'}>
        {keyStatus === 'unlocked' ? <FaLockOpen size={12} /> : <FaLock size={12} />}
      </span>
      <span title={connected ? 'Connected' : 'Offline'} style={{ opacity: connected ? 1 : 0.4 }} aria-label={connected ? 'Connected' : 'Offline'}>
        <FaWifi size={13} />
      </span>
    </>
  );
}

function Protected() {
  const { user, booting } = useAuth();
  const loc = useLocation();
  if (booting)
    return (
      <AuthShell title="ECN - Starting" icon="computer" width={380}>
        <Loading label="RESTORING SECURE SESSION" />
      </AuthShell>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return (
    <DataProvider>
      <Desktop tray={<Tray />}>
        <Dashboard />
      </Desktop>
    </DataProvider>
  );
}

function Guest({ children }) {
  const { user, booting } = useAuth();
  if (booting)
    return (
      <AuthShell title="ECN - Starting" icon="computer" width={380}>
        <Loading label="RESTORING SECURE SESSION" />
      </AuthShell>
    );
  return user ? <Navigate to="/inbox" replace /> : children;
}

export default function App() {
  const [booted, setBooted] = useState(() => {
    try {
      return sessionStorage.getItem('ecn.booted') === '1';
    } catch {
      return true;
    }
  });
  const finishBoot = () => {
    try {
      sessionStorage.setItem('ecn.booted', '1');
    } catch {
      /* ignore */
    }
    setBooted(true);
  };

  return (
    <ErrorBoundary>
      <AuthProvider>
        <UIProvider>
          {!booted ? (
            <BootScreen onDone={finishBoot} />
          ) : (
            <Routes>
              <Route path="/login" element={<Guest><Login /></Guest>} />
              <Route path="/register" element={<Guest><Register /></Guest>} />
              <Route element={<Protected />}>
                <Route path="/" element={<Navigate to="/inbox" replace />} />
                <Route path="/inbox" element={<Chat />} />
                <Route path="/inbox/:id" element={<Chat />} />
                <Route path="/archived" element={<Chat archived />} />
                <Route path="/archived/:id" element={<Chat archived />} />
                <Route path="/sent" element={<Sent />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/new" element={<NewConversation />} />
                <Route path="/security" element={<SecurityCenter />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          )}
        </UIProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
