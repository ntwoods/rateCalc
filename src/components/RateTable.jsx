import { memo, useMemo } from 'react';
import EmptyState from './EmptyState';
import LoadingTable from './LoadingTable';
import RateRow from './RateRow';
import RateTableHeader from './RateTableHeader';

function RateTable({
  products,
  settings,
  loading,
  error,
  search,
  onRetry,
  editor,
  mode,
  rateBasis,
  canEditSnapshotConditions = false,
  selectedSnapshotRef,
  historyByRowKey = {},
  snapshotItemsByRowKey = {}
}) {
  const tdPercent = Number(settings?.TD_PERCENT || 20);
  const rowModels = useMemo(() => {
    return products.map((product) => {
      const rowKey = editor.getRowKey(product);
      return {
        rowKey,
        product,
        rowMeta: editor.rowMetaByKey[rowKey],
        historyItem: historyByRowKey[rowKey] || null,
        snapshotItem: snapshotItemsByRowKey[rowKey] || null
      };
    });
  }, [products, editor, historyByRowKey, snapshotItemsByRowKey]);

  if (loading) {
    return <LoadingTable rows={12} />;
  }

  if (error) {
    return (
      <EmptyState
        type="error"
        title="Unable to load product master"
        description={error}
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }

  if (!products || products.length === 0) {
    return (
      <EmptyState
        title="No products found"
        description={search ? `No product matched "${search}".` : 'No products available from master data.'}
        actionLabel="Reload"
        onAction={onRetry}
      />
    );
  }

  return (
    <div className="rate-table-wrap" data-tour="rate-grid">
      <table className="rate-table">
        <RateTableHeader tdPercent={tdPercent} rateBasis={rateBasis} />
        <tbody>
          {rowModels.map((row) => (
            <RateRow
              key={row.rowKey}
              rowKey={row.rowKey}
              product={row.product}
              settings={settings}
              rowMeta={row.rowMeta}
              actions={editor.actions}
              mode={mode}
              rateBasis={rateBasis}
              canEditSnapshotConditions={canEditSnapshotConditions}
              selectedSnapshotRef={selectedSnapshotRef}
              historyItem={row.historyItem}
              snapshotItem={row.snapshotItem}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default memo(RateTable);
