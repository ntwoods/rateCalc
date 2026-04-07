import { useEffect } from 'react';

function Toast({
  open,
  type = 'success',
  message = '',
  onClose,
  durationMs = 3800
}) {
  useEffect(() => {
    if (!open || !message) {
      return undefined;
    }
    const timer = setTimeout(() => {
      onClose?.();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [open, message, onClose, durationMs]);

  if (!open || !message) {
    return null;
  }

  const tone = type === 'error' ? 'toast--error' : 'toast--success';

  return (
    <div className={`toast ${tone}`} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Dismiss message">
        ×
      </button>
    </div>
  );
}

export default Toast;

