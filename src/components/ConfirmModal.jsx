import { formatCurrencyINR } from '../utils/formatters';

function ConfirmModal({
  open,
  title,
  partyName,
  itemCount,
  rows,
  confirmLabel,
  loading,
  onConfirm,
  onCancel
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm-modal">
        <header className="confirm-modal__head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onCancel} disabled={loading} aria-label="Close">×</button>
        </header>

        <div className="confirm-modal__meta">
          <span><strong>Party:</strong> {partyName || '-'}</span>
          <span><strong>Selected Rows:</strong> {itemCount}</span>
        </div>

        <div className="confirm-modal__list-wrap">
          <table className="confirm-modal__table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Product</th>
                <th>Final Rate</th>
                <th>Special Disc %</th>
                <th>GST/Freight/CD</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((row) => (
                <tr key={row.rowKey}>
                  <td>{row.category}</td>
                  <td>{row.product}</td>
                  <td>{formatCurrencyINR(row.finalRate)}</td>
                  <td>{row.specialDiscPct}</td>
                  <td>{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="confirm-modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={loading}>
            No
          </button>
          <button type="button" className="btn" onClick={onConfirm} disabled={loading}>
            {loading ? 'Saving...' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ConfirmModal;