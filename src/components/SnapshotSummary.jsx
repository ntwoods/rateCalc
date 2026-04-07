import { APP_MODES, SNAPSHOT_VIEW_MODES } from '../constants/appConfig';
import { memo } from 'react';
import { formatDate, safeText, toNumberOrZero } from '../utils/formatters';
import HistoryBadge from './HistoryBadge';
import InlineError from './InlineError';

function SnapshotSummary({
  mode,
  selectedSnapshotRef,
  snapshotLoading,
  snapshotError,
  snapshotHeader,
  mappedCount,
  unmatchedCount,
  viewMode,
  onViewModeChange
}) {
  const inSnapshotMode = mode === APP_MODES.SNAPSHOT;
  const hasSnapshot = Boolean(selectedSnapshotRef);

  return (
    <section className="snapshot-summary">
      <div className="snapshot-summary__head">
        <h3>Snapshot Viewer</h3>
        <div className="snapshot-summary__toggle" role="group" aria-label="Snapshot view mode">
          <button
            type="button"
            className={`chip-btn ${viewMode === SNAPSHOT_VIEW_MODES.OVERLAY ? 'chip-btn--active' : ''}`}
            onClick={() => onViewModeChange?.(SNAPSHOT_VIEW_MODES.OVERLAY)}
            disabled={!inSnapshotMode || !hasSnapshot}
          >
            Overlay Full Grid
          </button>
          <button
            type="button"
            className={`chip-btn ${viewMode === SNAPSHOT_VIEW_MODES.SNAPSHOT_ONLY ? 'chip-btn--active' : ''}`}
            onClick={() => onViewModeChange?.(SNAPSHOT_VIEW_MODES.SNAPSHOT_ONLY)}
            disabled={!inSnapshotMode || !hasSnapshot}
          >
            Snapshot Rows Only
          </button>
        </div>
      </div>

      {!inSnapshotMode ? <p className="snapshot-summary__hint">Switch to Snapshot Mode to inspect saved references.</p> : null}
      {inSnapshotMode && !hasSnapshot ? <p className="snapshot-summary__hint">Choose a saved reference to load exact saved values.</p> : null}
      {snapshotLoading ? <p className="snapshot-summary__hint">Loading snapshot...</p> : null}
      {!snapshotLoading && snapshotError ? (
        <InlineError message={snapshotError} variant="soft" role="status" className="snapshot-summary__error-banner" />
      ) : null}

      {!snapshotLoading && !snapshotError && hasSnapshot && snapshotHeader ? (
        <div className="snapshot-summary__grid">
          <span><strong>Ref:</strong> {safeText(snapshotHeader.refKey, '-')}</span>
          <span><strong>Date:</strong> {formatDate(snapshotHeader.snapshotDateTime, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          <span><strong>Rows in Snapshot:</strong> {toNumberOrZero(snapshotHeader.itemCount)}</span>
          <span><strong>Mapped to Master:</strong> {toNumberOrZero(mappedCount)}</span>
          <span><strong>Unmatched:</strong> {toNumberOrZero(unmatchedCount)}</span>
          <span><HistoryBadge actionTag={snapshotHeader.actionTag} compact /></span>
        </div>
      ) : null}
    </section>
  );
}

export default memo(SnapshotSummary);
