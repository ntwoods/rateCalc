function NoHistoryState({
  title = 'No history available',
  description = 'No saved snapshots or latest history were found for this party yet.'
}) {
  return (
    <div className="no-history-state">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export default NoHistoryState;

