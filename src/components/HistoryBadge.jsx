function HistoryBadge({ actionTag = '', compact = false }) {
  const normalized = String(actionTag || '').trim().toUpperCase();
  const className = (() => {
    if (normalized === 'OWNER_APPROVED') {
      return 'history-badge history-badge--owner';
    }

    if (normalized === 'PARTY_AGREED' || normalized === 'DISPATCHED') {
      return 'history-badge history-badge--agreed';
    }

    return 'history-badge history-badge--neutral';
  })();

  return (
    <span className={`${className} ${compact ? 'history-badge--compact' : ''}`}>
      {normalized || 'N/A'}
    </span>
  );
}

export default HistoryBadge;