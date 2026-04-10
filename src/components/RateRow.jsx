import { memo, useMemo } from 'react';
import { CD_MODES, FREIGHT_MODES, GST_MODES } from '../constants/appConfig';
import { calculateRowRate } from '../utils/calcEngine';
import { formatCurrencyINR, formatDate, safeText } from '../utils/formatters';
import HistoryBadge from './HistoryBadge';

function normalizeActionTag(actionTag) {
  return String(actionTag || '').trim().toUpperCase();
}

function rowHighlightClass(actionTag, hasSnapshot) {
  const normalized = normalizeActionTag(actionTag);

  if (normalized === 'OWNER_APPROVED') {
    return hasSnapshot ? 'rate-row--snapshot-owner' : 'rate-row--history-owner';
  }

  if (normalized === 'PARTY_AGREED' || normalized === 'DISPATCHED') {
    return hasSnapshot ? 'rate-row--snapshot-agreed' : 'rate-row--history-agreed';
  }

  return hasSnapshot ? 'rate-row--snapshot-neutral' : 'rate-row--history-neutral';
}

function hasSpecialDiscountDispatch({
  actionTag,
  specialDiscPct
}) {
  if (normalizeActionTag(actionTag) !== 'DISPATCHED') {
    return false;
  }

  const discount = Number(specialDiscPct);
  return Number.isFinite(discount) && discount > 0;
}

function RateRow({
  rowKey,
  product,
  settings,
  rowMeta,
  actions,
  mode,
  selectedSnapshotRef,
  historyItem,
  snapshotItem
}) {
  const normalized = rowMeta?.normalized;
  const rowInput = rowMeta?.rowInput;

  const inSnapshotMode = mode === 'SNAPSHOT';
  const snapshotActive = inSnapshotMode && Boolean(selectedSnapshotRef);
  const disableRateFields = snapshotActive;
  const displayMaster = snapshotActive && snapshotItem
    ? {
        paymentTerms: snapshotItem.paymentTerms || product.paymentTerms,
        latestListPrice: snapshotItem.latestListPrice ?? product.latestListPrice,
        latestWEF: snapshotItem.latestWEF || product.latestWEF,
        previousListPrice: snapshotItem.previousListPrice ?? product.previousListPrice,
        previousWEF: snapshotItem.previousWEF || product.previousWEF
      }
    : {
        paymentTerms: product.paymentTerms,
        latestListPrice: product.latestListPrice,
        latestWEF: product.latestWEF,
        previousListPrice: product.previousListPrice,
        previousWEF: product.previousWEF
      };

  const calc = useMemo(() => {
    return calculateRowRate({
      latestListPrice: displayMaster.latestListPrice,
      paymentTerms: displayMaster.paymentTerms
    }, normalized || {}, settings || {});
  }, [displayMaster.latestListPrice, displayMaster.paymentTerms, normalized, settings]);

  const showCdHint = normalized?.cdMode === 'PERCENT' && normalized?.cdPercentMissing;
  const invalidSpecial = Boolean(normalized?.specialDiscInvalid);
  const invalidCd = Boolean(normalized?.cdPercentInvalid || normalized?.cdPercentTooHigh);

  const actionForHighlight = snapshotActive
    ? snapshotItem?.actionTag || historyItem?.lastActionTag
    : historyItem?.lastActionTag;

  const highlightClass = actionForHighlight
    ? rowHighlightClass(actionForHighlight, snapshotActive && Boolean(snapshotItem))
    : '';

  const specialDiscountDispatched = snapshotActive && snapshotItem
    ? hasSpecialDiscountDispatch({
        actionTag: snapshotItem.actionTag,
        specialDiscPct: snapshotItem.specialDiscPct
      })
    : hasSpecialDiscountDispatch({
        actionTag: historyItem?.lastActionTag,
        specialDiscPct: historyItem?.lastSpecialDiscPct
      });

  const rowClassName = `${highlightClass} ${specialDiscountDispatched ? 'rate-row--dispatched-special' : ''}`.trim();

  const historySummary = historyItem
    ? `${safeText(historyItem.lastGSTMode, '-')}/${safeText(historyItem.lastFreightMode, '-')}/${safeText(historyItem.lastCDMode, '-')} @ ${historyItem.lastSpecialDiscPct ?? 0}%`
    : '';

  const snapshotSummary = snapshotItem
    ? `${safeText(snapshotItem.gstMode, '-')}/${safeText(snapshotItem.freightMode, '-')}/${safeText(snapshotItem.cdMode, '-')} @ ${snapshotItem.specialDiscPct ?? 0}%`
    : '';

  return (
    <tr className={rowClassName}>
      <td className="cell-strong">{product.category}</td>
      <td className="cell-product">{product.product}</td>
      <td>
        <span className="terms-chip">{displayMaster.paymentTerms}</span>
      </td>

      <td className="cell-money">{formatCurrencyINR(displayMaster.latestListPrice)}</td>
      <td>{formatDate(displayMaster.latestWEF, { dateStyle: 'medium' })}</td>

      <td className="cell-money cell-money--subtle">
        {displayMaster.previousListPrice === null ? '-' : formatCurrencyINR(displayMaster.previousListPrice)}
      </td>
      <td className="cell-subtle">
        {displayMaster.previousWEF ? formatDate(displayMaster.previousWEF, { dateStyle: 'medium' }) : '-'}
      </td>

      <td className="cell-money">{formatCurrencyINR(calc.tdRate)}</td>

      <td>
        <input
          className={`table-input ${invalidSpecial ? 'table-input--invalid' : ''}`}
          type="text"
          inputMode="decimal"
          value={rowInput?.specialDiscPctInput ?? ''}
          disabled={disableRateFields}
          onChange={(event) => actions.setSpecialDiscForCategory(rowKey, product.category, event.target.value)}
        />
      </td>

      <td className="cell-money">{formatCurrencyINR(calc.afterSpecialDiscRate)}</td>

      <td>
        <select
          className="table-select"
          value={normalized?.gstMode || 'EXTRA'}
          disabled={disableRateFields}
          onChange={(event) => actions.setGstMode(rowKey, product.category, event.target.value)}
        >
          {Object.values(GST_MODES).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </td>

      <td>
        <select
          className="table-select"
          value={normalized?.freightMode || 'FOR'}
          disabled={disableRateFields}
          onChange={(event) => actions.setFreightMode(rowKey, product.category, event.target.value)}
        >
          {Object.values(FREIGHT_MODES).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </td>

      <td>
        <select
          className="table-select"
          value={normalized?.cdMode || 'NET_RATES'}
          disabled={disableRateFields}
          onChange={(event) => actions.setCdMode(rowKey, product.category, event.target.value)}
        >
          {Object.values(CD_MODES).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </td>

      <td>
        <input
          className={`table-input ${invalidCd ? 'table-input--invalid' : ''}`}
          type="text"
          inputMode="decimal"
          value={rowInput?.cdPercentInput ?? ''}
          disabled={disableRateFields || normalized?.cdMode === 'NET_RATES'}
          onChange={(event) => actions.setCdPercent(rowKey, product.category, event.target.value)}
        />
        {showCdHint ? <span className="cell-hint">Enter CD %</span> : null}
      </td>

      <td className="cell-money cell-final-rate">
        <span className="final-rate-pill">
          {calc.finalRate === null || calc.invalidFinalRate ? '-' : formatCurrencyINR(calc.finalRate)}
        </span>
      </td>

      <td>
        <input
          type="checkbox"
          checked={Boolean(rowInput?.ownerChecked)}
          onChange={(event) => actions.setOwnerChecked(rowKey, product.category, event.target.checked)}
          aria-label={`Owner select ${product.product}`}
        />
      </td>

      <td>
        <input
          type="checkbox"
          checked={Boolean(rowInput?.finalActionChecked)}
          onChange={(event) => actions.setFinalActionChecked(rowKey, product.category, event.target.checked)}
          aria-label={`Party agreed select ${product.product}`}
        />
      </td>

      <td className="cell-history">
        {snapshotActive && snapshotItem ? (
          <div className="history-cell">
            <HistoryBadge actionTag={snapshotItem.actionTag} compact />
            <span>{formatDate(snapshotItem.snapshotDateTime, { dateStyle: 'medium' })}</span>
            <span>{formatCurrencyINR(snapshotItem.finalRate)}</span>
            <span>{snapshotSummary}</span>
            {specialDiscountDispatched ? <span className="history-status-pill">Special Discount Dispatched</span> : null}
          </div>
        ) : historyItem ? (
          <div className="history-cell">
            <HistoryBadge actionTag={historyItem.lastActionTag} compact />
            <span>{formatDate(historyItem.lastTimestamp, { dateStyle: 'medium' })}</span>
            <span>{formatCurrencyINR(historyItem.lastFinalRate)}</span>
            <span>{historySummary}</span>
            {specialDiscountDispatched ? <span className="history-status-pill">Special Discount Dispatched</span> : null}
          </div>
        ) : (
          <span className="cell-subtle">No history</span>
        )}
      </td>
    </tr>
  );
}

function areEqual(prev, next) {
  return (
    prev.rowKey === next.rowKey &&
    prev.product === next.product &&
    prev.settings === next.settings &&
    prev.rowMeta === next.rowMeta &&
    prev.actions === next.actions &&
    prev.mode === next.mode &&
    prev.selectedSnapshotRef === next.selectedSnapshotRef &&
    prev.historyItem === next.historyItem &&
    prev.snapshotItem === next.snapshotItem
  );
}

export default memo(RateRow, areEqual);
