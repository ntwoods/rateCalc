const GOOGLE_GSI_SCRIPT = 'https://accounts.google.com/gsi/client';
const SCRIPT_ATTR = 'data-gsi-client-loader';

function parseBase64Url(input) {
  const safe = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = safe + '='.repeat((4 - (safe.length % 4)) % 4);
  return atob(padded);
}

function decodeJwtPayload(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return null;
  }

  const parts = idToken.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = parseBase64Url(parts[1]);
    return JSON.parse(payload);
  } catch (_) {
    return null;
  }
}

export function mapCredentialToUser(credentialResponse) {
  const idToken = credentialResponse?.credential || '';
  const claims = decodeJwtPayload(idToken) || {};

  return {
    idToken,
    sub: claims.sub || '',
    email: claims.email || '',
    emailVerified: Boolean(claims.email_verified),
    name: claims.name || '',
    givenName: claims.given_name || '',
    familyName: claims.family_name || '',
    picture: claims.picture || '',
    expiresAtMs: claims.exp ? Number(claims.exp) * 1000 : 0
  };
}

export async function loadGoogleIdentityScript(timeoutMs = 12000) {
  if (typeof window === 'undefined') {
    throw new Error('Google auth unavailable in non-browser context.');
  }

  if (window.google?.accounts?.id) {
    return true;
  }

  const existing = document.querySelector(`script[${SCRIPT_ATTR}="1"]`);
  if (existing) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Google Identity script load timed out.')), timeoutMs);
      const onLoad = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const onError = () => {
        clearTimeout(timer);
        reject(new Error('Failed to load Google Identity script.'));
      };

      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', onError, { once: true });

      if (window.google?.accounts?.id) {
        clearTimeout(timer);
        resolve(true);
      }
    });

    return Boolean(window.google?.accounts?.id);
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      reject(new Error('Google Identity script load timed out.'));
    }, timeoutMs);

    script.src = GOOGLE_GSI_SCRIPT;
    script.async = true;
    script.defer = true;
    script.setAttribute(SCRIPT_ATTR, '1');
    script.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Failed to load Google Identity script.'));
    };

    document.head.appendChild(script);
  });

  if (!window.google?.accounts?.id) {
    throw new Error('Google Identity API unavailable after script load.');
  }

  return true;
}

export async function initGoogleIdentity({
  clientId,
  onCredential,
  onError,
  autoSelect = false
} = {}) {
  const resolvedClientId = String(clientId || '').trim();
  if (!resolvedClientId) {
    throw new Error('Missing Google client ID.');
  }

  await loadGoogleIdentityScript();

  const googleId = window.google?.accounts?.id;
  if (!googleId) {
    throw new Error('Google Identity API is not available.');
  }

  googleId.initialize({
    client_id: resolvedClientId,
    auto_select: autoSelect,
    cancel_on_tap_outside: true,
    callback: (credentialResponse) => {
      try {
        const user = mapCredentialToUser(credentialResponse);
        onCredential?.(user, credentialResponse);
      } catch (error) {
        onError?.(error);
      }
    }
  });

  return {
    renderButton(targetElement, options = {}) {
      if (!targetElement) {
        return;
      }

      targetElement.innerHTML = '';
      googleId.renderButton(targetElement, {
        theme: 'outline',
        size: 'medium',
        shape: 'pill',
        text: 'signin_with',
        width: 220,
        ...options
      });
    },
    prompt() {
      googleId.prompt();
    },
    signOut(email) {
      try {
        googleId.disableAutoSelect();
        if (email && window.google?.accounts?.id?.revoke) {
          window.google.accounts.id.revoke(email, () => {});
        }
      } catch (_) {
        // no-op: local sign-out still proceeds in hook
      }
    }
  };
}

