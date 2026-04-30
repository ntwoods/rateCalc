import { memo } from 'react';

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
  setSignInHost,
  className
}) {
  const panelClassName = className ? `user-panel ${className}` : 'user-panel';

  return (
    <section className={panelClassName} aria-label="Signed-in user panel">
      {loading ? (
        <span className="user-chip">Loading...</span>
      ) : null}

      {!loading && isAuthenticated ? (
        <div className="user-panel__signed-in">
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
        <span className="user-panel__status" aria-label={`Auth status: ${authStatus}`} />
      ) : null}
    </section>
  );
}

export default memo(UserPanel);
