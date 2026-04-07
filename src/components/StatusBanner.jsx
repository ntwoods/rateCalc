import { memo } from 'react';
import { BACKEND_STATUS } from '../constants/appConfig';

function StatusBanner({ status, message, onRetry }) {
  const normalized = status || BACKEND_STATUS.LOADING;
  const statusText =
    normalized === BACKEND_STATUS.CONNECTED
      ? 'Backend Connected'
      : normalized === BACKEND_STATUS.FAILED
        ? 'Backend Connection Failed'
        : 'Checking Backend...';

  const classes = `status-banner status-banner--${normalized}`;

  return (
    <section className={classes} aria-live="polite">
      <div className="status-banner__left">
        <span className="status-dot" aria-hidden="true" />
        <strong>{statusText}</strong>
      </div>

      <div className="status-banner__message">{message || ''}</div>

      {normalized === BACKEND_STATUS.FAILED ? (
        <button className="btn btn--secondary" type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </section>
  );
}

export default memo(StatusBanner);
