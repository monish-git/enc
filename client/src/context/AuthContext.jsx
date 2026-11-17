import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from '../services/api.js';
import * as km from '../services/keyManager.js';
import { disconnectSocket } from '../services/socket.js';
import { clog } from '../services/clientLog.js';
import { playSound } from '../services/sound.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [booting, setBooting] = useState(true);
  const [keyStatus, setKeyStatus] = useState('none'); // none | locked | missing | unlocked
  const userRef = useRef(null);

  const setUser = useCallback((u) => {
    userRef.current = u;
    setUserState(u);
  }, []);

  const evalKeys = useCallback((u) => {
    if (!u) return setKeyStatus('none');
    const blob = km.getStoredBlob(u.id);
    if (!blob || blob.publicKey !== u.publicKey) return setKeyStatus('missing');
    setKeyStatus(km.isUnlocked(u.id) ? 'unlocked' : 'locked');
  }, []);

  // Keep keyStatus in sync with lock()/unlock() calls anywhere in the app.
  useEffect(() => km.subscribe(() => evalKeys(userRef.current)), [evalKeys]);

  const clearSession = useCallback(() => {
    disconnectSocket();
    km.lock();
    setUser(null);
    setKeyStatus('none');
  }, [setUser]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current) clearSession();
    });
  }, [clearSession]);

  // Restore an existing session on page load.
  useEffect(() => {
    let alive = true;
    api
      .get('/auth/me', { quiet401: true })
      .then(({ user: u }) => {
        if (!alive) return;
        setUser(u);
        evalKeys(u);
      })
      .catch(() => {})
      .finally(() => alive && setBooting(false));
    return () => {
      alive = false;
    };
  }, [evalKeys, setUser]);

  const login = useCallback(
    async (identifier, password) => {
      const { user: u } = await api.post('/auth/login', { identifier, password }, { quiet401: true });
      setUser(u);
      const blob = km.getStoredBlob(u.id);
      if (blob && blob.publicKey === u.publicKey) {
        try {
          await km.unlock(u.id, password); // the account password also unlocks the local key
          clog('USER AUTHENTICATED');
          clog('KEYS UNLOCKED (IN MEMORY ONLY)');
          playSound('unlock');
        } catch {
          clog('LOCAL KEY COULD NOT BE UNLOCKED WITH THIS PASSWORD', 'warn');
        }
      }
      evalKeys(u);
      return u;
    },
    [evalKeys, setUser]
  );

  const register = useCallback(
    async ({ username, email, password }) => {
      const { publicKey, blob } = await km.createIdentity(password); // generated in the browser
      clog('X25519 IDENTITY KEY PAIR GENERATED');
      const { user: u } = await api.post('/auth/register', { username, email, password, publicKey }, { quiet401: true });
      await km.installIdentity(u.id, blob, password);
      clog('PRIVATE KEY WRAPPED (AES-256-GCM / PBKDF2) AND STORED LOCALLY');
      try {
        sessionStorage.setItem('ecn.newAccount', '1'); // makes the dashboard offer a key backup once
      } catch {
        /* ignore */
      }
      setUser(u);
      evalKeys(u);
      return u;
    },
    [evalKeys, setUser]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {}, { quiet401: true });
    } catch {
      /* session may already be gone */
    }
    clog('USER LOGGED OUT');
    clearSession();
  }, [clearSession]);

  const unlockKeys = useCallback(
    async (password) => {
      await km.unlock(userRef.current.id, password);
      clog('KEYS UNLOCKED (IN MEMORY ONLY)');
      playSound('unlock');
    },
    []
  );

  const lockKeys = useCallback(() => {
    km.lock();
    clog('KEYS LOCKED - PLAINTEXT CLEARED FROM MEMORY');
    playSound('lock');
  }, []);

  const checkPassword = useCallback((password) => km.verifyPassword(userRef.current.id, password), []);

  const importKeys = useCallback(
    async (jsonText, password) => {
      const u = userRef.current;
      await km.importBackup(u.id, jsonText, password, u.publicKey);
      clog('KEY BACKUP IMPORTED AND UNLOCKED');
      evalKeys(u);
    },
    [evalKeys]
  );

  // Generate a brand-new identity (old messages can no longer be decrypted).
  const resetKeys = useCallback(
    async (password) => {
      const u = userRef.current;
      const { publicKey, blob } = await km.createIdentity(password);
      const { user: updated } = await api.post('/users/me/reset-key', { password, publicKey });
      await km.installIdentity(u.id, blob, password);
      setUser(updated);
      evalKeys(updated);
      clog('IDENTITY KEY PAIR REPLACED', 'warn');
      return updated;
    },
    [evalKeys, setUser]
  );

  const saveSettings = useCallback(
    async (patch) => {
      const prev = userRef.current;
      const { statusMessage, ...settings } = patch;
      setUser({ ...prev, ...(statusMessage !== undefined ? { statusMessage } : {}), settings: { ...prev.settings, ...settings } });
      try {
        const { user: u } = await api.put('/users/me/settings', patch);
        setUser(u);
        return u;
      } catch (err) {
        setUser(prev);
        throw err;
      }
    },
    [setUser]
  );

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const u = userRef.current;
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      // The local private key is wrapped with the account password, so re-wrap it too.
      let rewrapped = false;
      if (km.hasLocalKey(u.id)) {
        try {
          rewrapped = await km.rewrap(u.id, currentPassword, newPassword);
        } catch {
          rewrapped = false; // key was wrapped under an older password (e.g. imported backup)
        }
      }
      clog('PASSWORD CHANGED', 'warn');
      return { ...res, rewrapped };
    },
    []
  );

  const forgetDeviceKey = useCallback(() => {
    km.forgetLocalKey(userRef.current.id);
    evalKeys(userRef.current);
    clog('LOCAL KEY REMOVED FROM THIS DEVICE', 'warn');
  }, [evalKeys]);

  const value = useMemo(
    () => ({
      user, booting, keyStatus, setUser, login, register, logout, unlockKeys, lockKeys, checkPassword,
      importKeys, resetKeys, saveSettings, changePassword, forgetDeviceKey, refreshKeyStatus: () => evalKeys(userRef.current),
    }),
    [user, booting, keyStatus, setUser, login, register, logout, unlockKeys, lockKeys, checkPassword, importKeys, resetKeys, saveSettings, changePassword, forgetDeviceKey, evalKeys]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
