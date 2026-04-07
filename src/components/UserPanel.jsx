import { memo } from 'react';
import { safeText } from '../utils/formatters';

function UserPanel({
  authStatus,
  user,
  loading,
  isAuthenticated,
  isUnavailable,
  error,
  onSignIn,
  onSignOut,
  onRetry,
  setSignInHost
}) {
  return (
    <section className="user-panel" aria-label="Signed-in user panel">
      {loading ? (
        <span className="user-chip">Identity: Loading...</span>
      ) : null}

      {!loading && isAuthenticated ? (
        <div className="user-panel__signed-in">
          <div className="user-panel__identity">
            <strong>{safeText(user?.name, 'Signed-in User')}</strong>
            <span>{safeText(user?.email, '-')}</span>
          </div>
          <button type="button" className="btn btn--secondary btn--xs" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      ) : null}

      {!loading && !isAuthenticated ? (
        <div className="user-panel__signed-out">
          <div className="user-panel__auth-row">
            <div className="google-signin-host" ref={setSignInHost} />
            <button type="button" className="btn btn--secondary btn--xs" onClick={onSignIn}>
              Sign In
            </button>
          </div>

          {isUnavailable ? (
            <div className="user-panel__error">
              <span>{error || 'Google Sign-In temporarily unavailable.'}</span>
              <button type="button" className="btn btn--secondary btn--xs" onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error ? (
        <span className="user-panel__status">Auth: {authStatus}</span>
      ) : null}
    </section>
  );
}

export default memo(UserPanel);
