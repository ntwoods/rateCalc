function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  type = 'default'
}) {
  return (
    <div className={`empty-state empty-state--${type}`} role="status" aria-live="polite">
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && typeof onAction === 'function' ? (
        <button type="button" className="btn btn--secondary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default EmptyState;