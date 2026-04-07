import { memo } from 'react';
import { formatDate, safeText, toNumberOrZero } from '../utils/formatters';
import HistoryBadge from './HistoryBadge';
import InlineError from './InlineError';
import NoHistoryState from './NoHistoryState';
import NoPartySelected from './NoPartySelected';

function HistoryPanel({
  selectedParty,
  loading,
  error,
  historyCount,
  snapshotCount,
  onReload,
  latestHistorySample
}) {
  const noParty = !String(selectedParty || '').trim();
  const hasAnyHistory = toNumberOrZero(historyCount) > 0 || toNumberOrZero(snapshotCount) > 0;

  return (
    <section className="history-panel">
      <div className="history-panel__head">
        <h3>Party History Context</h3>
        <button type="button" className="btn btn--secondary" onClick={onReload} disabled={noParty || loading}>
          Refresh History
        </button>
      </div>

      {noParty ? <NoPartySelected message="Select a party to load latest history and saved references." /> : null}

      {loading ? <p className="history-panel__hint">Loading history...</p> : null}
      {!loading && error ? (
        <InlineError message={error} variant="soft" role="status" className="history-panel__error-banner" />
      ) : null}

      {!noParty ? (
        <div className="history-panel__stats">
          <span><strong>Party:</strong> {safeText(selectedParty, '-')}</span>
          <span><strong>Latest Items:</strong> {toNumberOrZero(historyCount)}</span>
          <span><strong>Saved References:</strong> {toNumberOrZero(snapshotCount)}</span>
        </div>
      ) : null}

      {!loading && !error && !noParty && !hasAnyHistory ? <NoHistoryState /> : null}

      {!loading && !error && !noParty && latestHistorySample ? (
        <div className="history-panel__sample">
          <HistoryBadge actionTag={latestHistorySample.lastActionTag} compact />
          <span>{safeText(latestHistorySample.product, '')}</span>
          <span>{formatDate(latestHistorySample.lastTimestamp, { dateStyle: 'medium' })}</span>
        </div>
      ) : null}
    </section>
  );
}

export default memo(HistoryPanel);
