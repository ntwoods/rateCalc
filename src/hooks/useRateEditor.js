import { useCallback, useEffect, useMemo, useState } from 'react';
import { CD_MODES, FREIGHT_MODES, GST_MODES } from '../constants/appConfig';
import { normalizeRowInputs } from '../utils/calcEngine';
import { normalizeToken } from '../utils/keys';

function getDefaultNetCd(settings) {
  const raw = Number(settings?.DEFAULT_NET_CD_PERCENT);
  if (Number.isFinite(raw) && raw >= 0) {
    return String(raw);
  }
  return '5';
}

function createDefaultRowInput(defaultNetCd, categoryDefaults = {}) {
  return {
    specialDiscPctInput: categoryDefaults.specialDiscPctInput ?? '0',
    gstMode: categoryDefaults.gstMode ?? GST_MODES.EXTRA,
    freightMode: categoryDefaults.freightMode ?? FREIGHT_MODES.FOR,
    cdMode: categoryDefaults.cdMode ?? CD_MODES.NET_RATES,
    cdPercentInput: defaultNetCd,
    ownerChecked: false,
    finalActionChecked: false
  };
}

function toText(value) {
  return String(value ?? '').trim();
}

function toBool(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  const text = toText(value).toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(text);
}

export function useRateEditor({ products = [], settings = {} } = {}) {
  const [rowInputsByKey, setRowInputsByKey] = useState({});
  const [categoryDiscountByKey, setCategoryDiscountByKey] = useState({});
  const [categoryGstModeByKey, setCategoryGstModeByKey] = useState({});
  const [categoryFreightModeByKey, setCategoryFreightModeByKey] = useState({});
  const [categoryCdModeByKey, setCategoryCdModeByKey] = useState({});

  const defaultNetCd = useMemo(() => getDefaultNetCd(settings), [settings]);

  const getCategoryKey = useCallback((category) => normalizeToken(category), []);

  const getRowKey = useCallback((product) => {
    return `${normalizeToken(product?.category)}|${normalizeToken(product?.product)}`;
  }, []);

  const ensureRow = useCallback((prev, rowKey, categoryKey) => {
    if (prev[rowKey]) {
      return prev[rowKey];
    }

    return createDefaultRowInput(defaultNetCd, {
      specialDiscPctInput: categoryDiscountByKey[categoryKey],
      gstMode: categoryGstModeByKey[categoryKey],
      freightMode: categoryFreightModeByKey[categoryKey],
      cdMode: categoryCdModeByKey[categoryKey]
    });
  }, [
    defaultNetCd,
    categoryDiscountByKey,
    categoryGstModeByKey,
    categoryFreightModeByKey,
    categoryCdModeByKey
  ]);

  useEffect(() => {
    if (!Array.isArray(products) || products.length === 0) {
      return;
    }

    setRowInputsByKey((prev) => {
      let next = prev;
      let changed = false;

      products.forEach((product) => {
        const rowKey = getRowKey(product);
        const categoryKey = getCategoryKey(product.category);
        const categoryDiscount = categoryDiscountByKey[categoryKey];
        const categoryGstMode = categoryGstModeByKey[categoryKey];
        const categoryFreightMode = categoryFreightModeByKey[categoryKey];
        const categoryCdMode = categoryCdModeByKey[categoryKey];

        if (!next[rowKey]) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          next[rowKey] = createDefaultRowInput(defaultNetCd, {
            specialDiscPctInput: categoryDiscount,
            gstMode: categoryGstMode,
            freightMode: categoryFreightMode,
            cdMode: categoryCdMode
          });
          return;
        }

        const current = next[rowKey];
        const patch = {};
        if (categoryDiscount !== undefined && current.specialDiscPctInput !== categoryDiscount) {
          patch.specialDiscPctInput = categoryDiscount;
        }
        if (categoryGstMode !== undefined && current.gstMode !== categoryGstMode) {
          patch.gstMode = categoryGstMode;
        }
        if (categoryFreightMode !== undefined && current.freightMode !== categoryFreightMode) {
          patch.freightMode = categoryFreightMode;
        }
        if (categoryCdMode !== undefined && current.cdMode !== categoryCdMode) {
          patch.cdMode = categoryCdMode;
          if (categoryCdMode === CD_MODES.PERCENT && String(current.cdPercentInput || '').trim() === '') {
            patch.cdPercentInput = defaultNetCd;
          }
        }

        if (Object.keys(patch).length > 0) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          next[rowKey] = {
            ...next[rowKey],
            ...patch
          };
        }
      });

      return changed ? next : prev;
    });
  }, [
    products,
    defaultNetCd,
    getRowKey,
    getCategoryKey,
    categoryDiscountByKey,
    categoryGstModeByKey,
    categoryFreightModeByKey,
    categoryCdModeByKey
  ]);

  const updateField = useCallback((rowKey, categoryKey, field, value) => {
    setRowInputsByKey((prev) => {
      const current = ensureRow(prev, rowKey, categoryKey);
      if (current[field] === value) {
        return prev;
      }

      return {
        ...prev,
        [rowKey]: {
          ...current,
          [field]: value
        }
      };
    });
  }, [ensureRow]);

  const setSpecialDiscForCategory = useCallback((rowKey, category, rawValue) => {
    const categoryKey = getCategoryKey(category);
    const nextValue = String(rawValue ?? '').trim();

    setCategoryDiscountByKey((prev) => {
      if (prev[categoryKey] === nextValue) {
        return prev;
      }
      return {
        ...prev,
        [categoryKey]: nextValue
      };
    });

    setRowInputsByKey((prev) => {
      let changed = false;
      let next = prev;

      Object.keys(prev).forEach((key) => {
        if (!key.startsWith(`${categoryKey}|`)) {
          return;
        }

        const current = prev[key];
        if (current.specialDiscPctInput === nextValue) {
          return;
        }

        if (!changed) {
          next = { ...prev };
          changed = true;
        }

        next[key] = {
          ...current,
          specialDiscPctInput: nextValue
        };
      });

      const currentRow = ensureRow(next, rowKey, categoryKey);
      if (currentRow.specialDiscPctInput !== nextValue) {
        if (!changed) {
          next = { ...next };
          changed = true;
        }
        next[rowKey] = {
          ...currentRow,
          specialDiscPctInput: nextValue
        };
      }

      return changed ? next : prev;
    });
  }, [ensureRow, getCategoryKey]);

  const setCdMode = useCallback((rowKey, category, nextMode) => {
    const categoryKey = getCategoryKey(category);
    const modeValue = String(nextMode || '').trim().toUpperCase();

    setCategoryCdModeByKey((prev) => {
      if (prev[categoryKey] === modeValue) {
        return prev;
      }
      return {
        ...prev,
        [categoryKey]: modeValue
      };
    });

    setRowInputsByKey((prev) => {
      let changed = false;
      let next = prev;

      Object.keys(prev).forEach((key) => {
        if (!key.startsWith(`${categoryKey}|`)) {
          return;
        }
        const current = prev[key];
        const patch = {};

        if (current.cdMode !== modeValue) {
          patch.cdMode = modeValue;
        }
        if (
          modeValue === CD_MODES.PERCENT &&
          String(current.cdPercentInput || '').trim() === ''
        ) {
          patch.cdPercentInput = defaultNetCd;
        }

        if (Object.keys(patch).length === 0) {
          return;
        }

        if (!changed) {
          next = { ...prev };
          changed = true;
        }

        next[key] = {
          ...current,
          ...patch
        };
      });

      const currentRow = ensureRow(next, rowKey, categoryKey);
      const patch = {};
      if (currentRow.cdMode !== modeValue) {
        patch.cdMode = modeValue;
      }
      if (
        modeValue === CD_MODES.PERCENT &&
        String(currentRow.cdPercentInput || '').trim() === ''
      ) {
        patch.cdPercentInput = defaultNetCd;
      }

      if (Object.keys(patch).length > 0) {
        if (!changed) {
          next = { ...next };
          changed = true;
        }
        next[rowKey] = {
          ...currentRow,
          ...patch
        };
      }

      return changed ? next : prev;
    });
  }, [defaultNetCd, ensureRow, getCategoryKey]);

  const setOwnerChecked = useCallback((rowKey, category, checked) => {
    updateField(rowKey, getCategoryKey(category), 'ownerChecked', Boolean(checked));
  }, [updateField, getCategoryKey]);

  const setFinalActionChecked = useCallback((rowKey, category, checked) => {
    updateField(rowKey, getCategoryKey(category), 'finalActionChecked', Boolean(checked));
  }, [updateField, getCategoryKey]);

  const setGstMode = useCallback((rowKey, category, value) => {
    const categoryKey = getCategoryKey(category);
    const nextValue = String(value || '').trim().toUpperCase();

    setCategoryGstModeByKey((prev) => {
      if (prev[categoryKey] === nextValue) {
        return prev;
      }
      return {
        ...prev,
        [categoryKey]: nextValue
      };
    });

    setRowInputsByKey((prev) => {
      let changed = false;
      let next = prev;

      Object.keys(prev).forEach((key) => {
        if (!key.startsWith(`${categoryKey}|`)) {
          return;
        }

        const current = prev[key];
        if (current.gstMode === nextValue) {
          return;
        }

        if (!changed) {
          next = { ...prev };
          changed = true;
        }

        next[key] = {
          ...current,
          gstMode: nextValue
        };
      });

      const currentRow = ensureRow(next, rowKey, categoryKey);
      if (currentRow.gstMode !== nextValue) {
        if (!changed) {
          next = { ...next };
          changed = true;
        }
        next[rowKey] = {
          ...currentRow,
          gstMode: nextValue
        };
      }

      return changed ? next : prev;
    });
  }, [ensureRow, getCategoryKey]);

  const setFreightMode = useCallback((rowKey, category, value) => {
    const categoryKey = getCategoryKey(category);
    const nextValue = String(value || '').trim().toUpperCase();

    setCategoryFreightModeByKey((prev) => {
      if (prev[categoryKey] === nextValue) {
        return prev;
      }
      return {
        ...prev,
        [categoryKey]: nextValue
      };
    });

    setRowInputsByKey((prev) => {
      let changed = false;
      let next = prev;

      Object.keys(prev).forEach((key) => {
        if (!key.startsWith(`${categoryKey}|`)) {
          return;
        }

        const current = prev[key];
        if (current.freightMode === nextValue) {
          return;
        }

        if (!changed) {
          next = { ...prev };
          changed = true;
        }

        next[key] = {
          ...current,
          freightMode: nextValue
        };
      });

      const currentRow = ensureRow(next, rowKey, categoryKey);
      if (currentRow.freightMode !== nextValue) {
        if (!changed) {
          next = { ...next };
          changed = true;
        }
        next[rowKey] = {
          ...currentRow,
          freightMode: nextValue
        };
      }

      return changed ? next : prev;
    });
  }, [ensureRow, getCategoryKey]);

  const setCdPercent = useCallback((rowKey, category, value) => {
    updateField(rowKey, getCategoryKey(category), 'cdPercentInput', String(value ?? ''));
  }, [updateField, getCategoryKey]);

  const clearSelections = useCallback((type, rowKeys) => {
    const field = type === 'final' ? 'finalActionChecked' : 'ownerChecked';
    const scoped = Array.isArray(rowKeys) && rowKeys.length > 0 ? new Set(rowKeys) : null;

    setRowInputsByKey((prev) => {
      let changed = false;
      const next = { ...prev };

      Object.keys(next).forEach((key) => {
        if (scoped && !scoped.has(key)) {
          return;
        }

        if (next[key][field]) {
          next[key] = {
            ...next[key],
            [field]: false
          };
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, []);

  const applySnapshotToRows = useCallback((snapshotItemsByRowKey) => {
    const source = snapshotItemsByRowKey && typeof snapshotItemsByRowKey === 'object'
      ? snapshotItemsByRowKey
      : {};

    const keys = Object.keys(source);
    if (keys.length === 0) {
      return;
    }

    setCategoryDiscountByKey((prev) => {
      let changed = false;
      const next = { ...prev };

      keys.forEach((rowKey) => {
        const snapshot = source[rowKey];
        if (!snapshot) {
          return;
        }
        const categoryKey = getCategoryKey(snapshot.category || rowKey.split('|')[0]);
        const discountText = toText(snapshot.specialDiscPct);
        if (next[categoryKey] !== discountText) {
          next[categoryKey] = discountText;
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    setCategoryGstModeByKey((prev) => {
      let changed = false;
      const next = { ...prev };

      keys.forEach((rowKey) => {
        const snapshot = source[rowKey];
        if (!snapshot) {
          return;
        }
        const categoryKey = getCategoryKey(snapshot.category || rowKey.split('|')[0]);
        const mode = toText(snapshot.gstMode).toUpperCase();
        if (mode && next[categoryKey] !== mode) {
          next[categoryKey] = mode;
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    setCategoryFreightModeByKey((prev) => {
      let changed = false;
      const next = { ...prev };

      keys.forEach((rowKey) => {
        const snapshot = source[rowKey];
        if (!snapshot) {
          return;
        }
        const categoryKey = getCategoryKey(snapshot.category || rowKey.split('|')[0]);
        const mode = toText(snapshot.freightMode).toUpperCase();
        if (mode && next[categoryKey] !== mode) {
          next[categoryKey] = mode;
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    setCategoryCdModeByKey((prev) => {
      let changed = false;
      const next = { ...prev };

      keys.forEach((rowKey) => {
        const snapshot = source[rowKey];
        if (!snapshot) {
          return;
        }
        const categoryKey = getCategoryKey(snapshot.category || rowKey.split('|')[0]);
        const mode = toText(snapshot.cdMode).toUpperCase();
        if (mode && next[categoryKey] !== mode) {
          next[categoryKey] = mode;
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    setRowInputsByKey((prev) => {
      let changed = false;
      const next = { ...prev };

      keys.forEach((rowKey) => {
        const snapshot = source[rowKey];
        if (!snapshot) {
          return;
        }

        const categoryKey = rowKey.split('|')[0];
        const current = ensureRow(next, rowKey, categoryKey);

        const patched = {
          ...current,
          specialDiscPctInput: toText(snapshot.specialDiscPct),
          gstMode: toText(snapshot.gstMode || current.gstMode).toUpperCase(),
          freightMode: toText(snapshot.freightMode || current.freightMode).toUpperCase(),
          cdMode: toText(snapshot.cdMode || current.cdMode).toUpperCase(),
          cdPercentInput: toText(snapshot.cdPercent),
          ownerChecked: toBool(snapshot.ownerChecked),
          finalActionChecked: toBool(snapshot.finalActionChecked)
        };

        const isSame =
          current.specialDiscPctInput === patched.specialDiscPctInput &&
          current.gstMode === patched.gstMode &&
          current.freightMode === patched.freightMode &&
          current.cdMode === patched.cdMode &&
          current.cdPercentInput === patched.cdPercentInput &&
          current.ownerChecked === patched.ownerChecked &&
          current.finalActionChecked === patched.finalActionChecked;

        if (!isSame) {
          next[rowKey] = patched;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [ensureRow, getCategoryKey]);

  const rowMetaByKey = useMemo(() => {
    const meta = {};

    products.forEach((product) => {
      const rowKey = getRowKey(product);
      const categoryKey = getCategoryKey(product.category);
      const rowInput = rowInputsByKey[rowKey] || createDefaultRowInput(defaultNetCd, {
        specialDiscPctInput: categoryDiscountByKey[categoryKey],
        gstMode: categoryGstModeByKey[categoryKey],
        freightMode: categoryFreightModeByKey[categoryKey],
        cdMode: categoryCdModeByKey[categoryKey]
      });
      const normalized = normalizeRowInputs(rowInput, settings);

      meta[rowKey] = {
        rowKey,
        categoryKey,
        rowInput,
        normalized
      };
    });

    return meta;
  }, [
    products,
    rowInputsByKey,
    settings,
    getRowKey,
    getCategoryKey,
    defaultNetCd,
    categoryDiscountByKey,
    categoryGstModeByKey,
    categoryFreightModeByKey,
    categoryCdModeByKey
  ]);

  const selectedCounts = useMemo(() => {
    let ownerCount = 0;
    let finalCount = 0;

    Object.keys(rowMetaByKey).forEach((rowKey) => {
      const row = rowMetaByKey[rowKey].rowInput;
      if (row.ownerChecked) {
        ownerCount += 1;
      }
      if (row.finalActionChecked) {
        finalCount += 1;
      }
    });

    return {
      ownerCount,
      finalCount
    };
  }, [rowMetaByKey]);

  const actions = useMemo(() => {
    return {
      setSpecialDiscForCategory,
      setGstMode,
      setFreightMode,
      setCdMode,
      setCdPercent,
      setOwnerChecked,
      setFinalActionChecked,
      clearSelections,
      applySnapshotToRows
    };
  }, [
    setSpecialDiscForCategory,
    setGstMode,
    setFreightMode,
    setCdMode,
    setCdPercent,
    setOwnerChecked,
    setFinalActionChecked,
    clearSelections,
    applySnapshotToRows
  ]);

  return {
    getRowKey,
    getCategoryKey,
    rowMetaByKey,
    categoryDiscountByKey,
    selectedCounts,
    actions
  };
}
