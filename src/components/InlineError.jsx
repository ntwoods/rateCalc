function InlineError({
  message,
  variant = 'error',
  actionLabel = '',
  onAction,
  role = 'alert',
  className = ''
}) {
  if (!message) {
    return null;
  }

  const classes = [
    'inline-alert',
    variant === 'soft' ? 'inline-alert--soft' : '',
    variant === 'success' ? 'inline-alert--success' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role={role}>
      <span>{message}</span>
      {actionLabel && typeof onAction === 'function' ? (
        <button type="button" className="btn btn--secondary btn--xs" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default InlineError;

