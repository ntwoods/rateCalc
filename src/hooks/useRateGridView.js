import { useEffect, useMemo } from 'react';
import { APP_MODES, RATE_BASIS, SNAPSHOT_VIEW_MODES } from '../constants/appConfig';
import { calculateRowRate } from '../utils/calcEngine';

function resolveMasterValues(product, snapshotItem) {
  if (!snapshotItem) {
    return {
      paymentTerms: product.paymentTerms,
      latestListPrice: product.latestListPrice,
      latestWEF: product.latestWEF,
      previousListPrice: product.previousListPrice,
      previousWEF: product.previousWEF
    };
  }

  return {
    paymentTerms: snapshotItem.paymentTerms || product.paymentTerms,
    latestListPrice: snapshotItem.latestListPrice ?? product.latestListPrice,
    latestWEF: snapshotItem.latestWEF || product.latestWEF,
    previousListPrice: snapshotItem.previousListPrice ?? product.previousListPrice,
    previousWEF: snapshotItem.previousWEF || product.previousWEF
  };
}

export function useRateGridView({
  products = [],
  settings = {},
  mode,
  selectedSnapshotRef,
  snapshotViewMode,
  rateBasis,
  snapshotError,
  snapshotItems = [],
  snapshotItemsByRowKey = {},
  makeRowKey,
  rateEditor
}) {
  const activeSnapshotMap = useMemo(() => {
    if (mode !== APP_MODES.SNAPSHOT || !selectedSnapshotRef || snapshotError) {
      return {};
    }
    return snapshotItemsByRowKey;
  }, [mode, selectedSnapshotRef, snapshotError, snapshotItemsByRowKey]);

  useEffect(() => {
    if (mode !== APP_MODES.SNAPSHOT || !selectedSnapshotRef) {
      return;
    }
    if (Object.keys(activeSnapshotMap).length === 0) {
      return;
    }
    rateEditor.actions.applySnapshotToRows(activeSnapshotMap);
  }, [mode, selectedSnapshotRef, activeSnapshotMap, rateEditor.actions]);

  const displayedProducts = useMemo(() => {
    if (
      mode !== APP_MODES.SNAPSHOT ||
      !selectedSnapshotRef ||
      snapshotViewMode !== SNAPSHOT_VIEW_MODES.SNAPSHOT_ONLY
    ) {
      return products;
    }

    return products.filter((product) => {
      const rowKey = makeRowKey(product.category, product.product);
      return Boolean(activeSnapshotMap[rowKey]);
    });
  }, [products, mode, selectedSnapshotRef, snapshotViewMode, activeSnapshotMap, makeRowKey]);

  const mappedSnapshotCount = useMemo(() => {
    if (!Array.isArray(products) || products.length === 0) {
      return 0;
    }

    const masterRowKeySet = new Set(
      products.map((product) => makeRowKey(product.category, product.product))
    );

    let mapped = 0;
    Object.keys(snapshotItemsByRowKey).forEach((key) => {
      if (masterRowKeySet.has(key)) {
        mapped += 1;
      }
    });
    return mapped;
  }, [products, makeRowKey, snapshotItemsByRowKey]);

  const unmatchedSnapshotCount = useMemo(() => {
    return Math.max(0, snapshotItems.length - mappedSnapshotCount);
  }, [snapshotItems.length, mappedSnapshotCount]);

  const selectedRowsByType = useMemo(() => {
    const ownerRows = [];
    const finalRows = [];

    displayedProducts.forEach((product) => {
      const rowKey = rateEditor.getRowKey(product);
      const rowMeta = rateEditor.rowMetaByKey[rowKey];
      if (!rowMeta) {
        return;
      }

      const snapshotItem = activeSnapshotMap[rowKey] || null;
      const resolvedMaster = resolveMasterValues(product, snapshotItem);
      const sourceListPrice = rateBasis === RATE_BASIS.OLD
        ? resolvedMaster.previousListPrice
        : resolvedMaster.latestListPrice;
      const sourceWEF = rateBasis === RATE_BASIS.OLD
        ? resolvedMaster.previousWEF
        : resolvedMaster.latestWEF;
      const hasSourceListPrice =
        sourceListPrice !== null &&
        sourceListPrice !== undefined &&
        String(sourceListPrice).trim() !== '' &&
        Number.isFinite(Number(sourceListPrice));

      const calc = hasSourceListPrice
        ? calculateRowRate(
            {
              latestListPrice: sourceListPrice,
              paymentTerms: resolvedMaster.paymentTerms
            },
            rowMeta.normalized,
            settings
          )
        : {
            tdRate: null,
            afterSpecialDiscRate: null,
            finalRate: null,
            invalidFinalRate: true
          };

      const row = {
        rowKey,
        category: product.category,
        product: product.product,
        paymentTerms: resolvedMaster.paymentTerms,
        latestListPrice: resolvedMaster.latestListPrice,
        latestWEF: resolvedMaster.latestWEF,
        previousListPrice: resolvedMaster.previousListPrice,
        previousWEF: resolvedMaster.previousWEF,
        sourceListPrice,
        sourceWEF,
        ownerChecked: Boolean(rowMeta.rowInput?.ownerChecked),
        finalActionChecked: Boolean(rowMeta.rowInput?.finalActionChecked),
        normalized: rowMeta.normalized,
        calc
      };

      if (row.ownerChecked) {
        ownerRows.push(row);
      }
      if (row.finalActionChecked) {
        finalRows.push(row);
      }
    });

    return { ownerRows, finalRows };
  }, [displayedProducts, rateEditor, activeSnapshotMap, settings, rateBasis]);

  return {
    activeSnapshotMap,
    displayedProducts,
    mappedSnapshotCount,
    unmatchedSnapshotCount,
    selectedRowsByType
  };
}
