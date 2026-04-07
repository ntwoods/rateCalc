import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_CONFIG, AUTH_STATUS } from '../constants/appConfig';
import { initGoogleIdentity } from '../utils/googleAuth';

const STORAGE_KEY = 'portal.auth.user.v1';

function safeReadUser() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (parsed.expiresAtMs && Number(parsed.expiresAtMs) < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch (_) {
    return null;
  }
}

function safeWriteUser(user) {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  try {
    if (!user) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch (_) {
    // ignore storage failures
  }
}

export function useAuth() {
  const initialUser = safeReadUser();
  const [status, setStatus] = useState(initialUser ? AUTH_STATUS.SIGNED_IN : AUTH_STATUS.IDLE);
  const [user, setUser] = useState(initialUser);
  const [error, setError] = useState('');

  const identityClientRef = useRef(null);
  const signInHostRef = useRef(null);
  const initPromiseRef = useRef(null);

  const renderSignInButtonIfPossible = useCallback(() => {
    if (!identityClientRef.current || !signInHostRef.current || user?.email) {
      return;
    }
    identityClientRef.current.renderButton(signInHostRef.current);
  }, [user]);

  const initialize = useCallback(async () => {
    if (identityClientRef.current) {
      renderSignInButtonIfPossible();
      return identityClientRef.current;
    }

    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    const clientId = APP_CONFIG.GOOGLE_CLIENT_ID;
    if (!clientId) {
      setStatus(AUTH_STATUS.UNAVAILABLE);
      setError('Google Sign-In is not configured (missing VITE_GOOGLE_CLIENT_ID).');
      return null;
    }

    setStatus((prev) => (prev === AUTH_STATUS.SIGNED_IN ? AUTH_STATUS.SIGNED_IN : AUTH_STATUS.LOADING));
    setError('');

    const initPromise = initGoogleIdentity({
      clientId,
      autoSelect: false,
      onCredential: (nextUser) => {
        if (!nextUser?.email) {
          setError('Google sign-in response did not include an email.');
          return;
        }
        setUser(nextUser);
        safeWriteUser(nextUser);
        setStatus(AUTH_STATUS.SIGNED_IN);
        setError('');
      },
      onError: (identityError) => {
        setError(identityError?.message || 'Google Sign-In failed.');
        setStatus((prev) => (prev === AUTH_STATUS.SIGNED_IN ? AUTH_STATUS.SIGNED_IN : AUTH_STATUS.ERROR));
      }
    })
      .then((identityClient) => {
        identityClientRef.current = identityClient;
        setStatus((prev) => (prev === AUTH_STATUS.SIGNED_IN ? AUTH_STATUS.SIGNED_IN : AUTH_STATUS.READY));
        renderSignInButtonIfPossible();
        return identityClient;
      })
      .catch((identityError) => {
        setError(identityError?.message || 'Google Sign-In unavailable.');
        setStatus((prev) => (prev === AUTH_STATUS.SIGNED_IN ? AUTH_STATUS.SIGNED_IN : AUTH_STATUS.ERROR));
        return null;
      })
      .finally(() => {
        initPromiseRef.current = null;
      });

    initPromiseRef.current = initPromise;
    return initPromise;
  }, [renderSignInButtonIfPossible]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const setSignInHost = useCallback((node) => {
    signInHostRef.current = node || null;
    renderSignInButtonIfPossible();
  }, [renderSignInButtonIfPossible]);

  const signIn = useCallback(async () => {
    if (!identityClientRef.current) {
      await initialize();
    }

    if (!identityClientRef.current) {
      setError('Google Sign-In is not ready yet. Please retry.');
      return;
    }

    setError('');
    identityClientRef.current.prompt();
  }, [initialize]);

  const signOut = useCallback(() => {
    const email = user?.email || '';
    identityClientRef.current?.signOut(email);
    setUser(null);
    safeWriteUser(null);
    setStatus(identityClientRef.current ? AUTH_STATUS.READY : AUTH_STATUS.ERROR);
    renderSignInButtonIfPossible();
  }, [renderSignInButtonIfPossible, user]);

  const reload = useCallback(async () => {
    setError('');
    await initialize();
    renderSignInButtonIfPossible();
  }, [initialize, renderSignInButtonIfPossible]);

  return useMemo(() => {
    const isAuthenticated = Boolean(user?.email);
    const isLoading = status === AUTH_STATUS.IDLE || status === AUTH_STATUS.LOADING;
    const isUnavailable = status === AUTH_STATUS.UNAVAILABLE || status === AUTH_STATUS.ERROR;

    return {
      status,
      user,
      error,
      isAuthenticated,
      isLoading,
      isUnavailable,
      canSave: isAuthenticated,
      setSignInHost,
      signIn,
      signOut,
      reload
    };
  }, [status, user, error, setSignInHost, signIn, signOut, reload]);
}
