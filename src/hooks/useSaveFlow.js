import { useCallback, useMemo, useState } from 'react';
import { apiClient } from '../api/apiClient';
import {
  API_ACTIONS,
  APP_MODES,
  FINAL_ACTION_TAGS
} from '../constants/appConfig';
import { normalizeToken } from '../utils/keys';
import {
  buildConfirmationRows,
  buildFinalActionPayload,
  buildOwnerApprovalPayload
} from '../utils/payloadBuilders';
import { safeText, toNumberOrZero } from '../utils/formatters';

const INITIAL_CONFIRM_STATE = Object.freeze({
  open: false,
  type: '',
  rows: [],
  confirmationRows: [],
  title: '',
  confirmLabel: ''
});

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validateBeforeSave({
  type,
  rows,
  selectedParty,
  isAuthenticated,
  signedInEmail
}) {
  if (!selectedParty) {
    return 'Select a party before saving.';
  }

  if (!isAuthenticated || !isValidEmail(signedInEmail)) {
    return 'Sign in with Google before saving.';
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return type === 'owner'
      ? 'Select at least one Owner row to save.'
      : 'Select at least one Party Agreed row to save.';
  }

  const categoryDiscounts = {};
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const categoryKey = normalizeToken(row.category);
    const disc = Number(row.normalized?.specialDiscPct ?? 0);

    if (categoryDiscounts[categoryKey] === undefined) {
      categoryDiscounts[categoryKey] = disc;
    } else if (categoryDiscounts[categoryKey] !== disc) {
      return `Category-level special discount mismatch found for ${row.category}.`;
    }

    if (
      row.normalized?.cdMode === 'PERCENT' &&
      (row.normalized?.cdPercentMissing ||
        row.normalized?.cdPercentInvalid ||
        row.normalized?.cdPercentTooHigh)
    ) {
      return `Invalid CD % for ${row.product}. Fix CD % before save.`;
    }

    if (row.calc?.finalRate === null || row.calc?.finalRate === undefined || row.calc?.invalidFinalRate) {
      return `List price not available for ${row.product} in selected view.`;
    }
  }

  return '';
}

function normalizeMode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeNumericSignature(value, allowBlank = false) {
  if (value === null || value === undefined || value === '') {
    return allowBlank ? '' : '0';
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return String(value).trim();
  }
  return String(Math.round((num + Number.EPSILON) * 100) / 100);
}

function buildRowComparisonSignature(row) {
  const normalized = row?.normalized || {};
  return [
    normalizeMode(row?.category),
    normalizeMode(row?.product),
    normalizeNumericSignature(row?.paymentTerms),
    normalizeNumericSignature(row?.sourceListPrice ?? row?.latestListPrice),
    normalizeNumericSignature(normalized.specialDiscPct),
    normalizeMode(normalized.gstMode),
    normalizeMode(normalized.freightMode),
    normalizeMode(normalized.cdMode),
    normalizeNumericSignature(
      normalized.cdMode === 'PERCENT' ? normalized.cdPercent : normalized.defaultNetCdPercent
    ),
    row?.ownerChecked ? '1' : '0',
    row?.finalActionChecked ? '1' : '0',
    normalizeNumericSignature(row?.calc?.finalRate, true)
  ].join('|');
}

function buildSnapshotComparisonSignature(snapshotItem) {
  return [
    normalizeMode(snapshotItem?.category),
    normalizeMode(snapshotItem?.product),
    normalizeNumericSignature(snapshotItem?.paymentTerms),
    normalizeNumericSignature(snapshotItem?.latestListPrice),
    normalizeNumericSignature(snapshotItem?.specialDiscPct),
    normalizeMode(snapshotItem?.gstMode),
    normalizeMode(snapshotItem?.freightMode),
    normalizeMode(snapshotItem?.cdMode),
    normalizeNumericSignature(snapshotItem?.cdPercent),
    snapshotItem?.ownerChecked ? '1' : '0',
    snapshotItem?.finalActionChecked ? '1' : '0',
    normalizeNumericSignature(snapshotItem?.finalRate, true)
  ].join('|');
}

function hasSelectionSetChanges(type, selectedRows, snapshotItemsByRowKey) {
  const expectedSet = new Set();
  Object.keys(snapshotItemsByRowKey || {}).forEach((rowKey) => {
    const snapshot = snapshotItemsByRowKey[rowKey];
    if (!snapshot) {
      return;
    }
    const checked = type === 'owner'
      ? Boolean(snapshot.ownerChecked)
      : Boolean(snapshot.finalActionChecked);
    if (checked) {
      expectedSet.add(rowKey);
    }
  });

  const selectedSet = new Set((selectedRows || []).map((row) => row.rowKey));
  if (expectedSet.size !== selectedSet.size) {
    return true;
  }

  for (const rowKey of selectedSet.values()) {
    if (!expectedSet.has(rowKey)) {
      return true;
    }
  }

  return false;
}

function hasAdminSnapshotChanges(type, selectedRows, snapshotItemsByRowKey) {
  if (!Array.isArray(selectedRows) || selectedRows.length === 0) {
    return false;
  }

  if (hasSelectionSetChanges(type, selectedRows, snapshotItemsByRowKey)) {
    return true;
  }

  for (let i = 0; i < selectedRows.length; i += 1) {
    const row = selectedRows[i];
    const snapshot = snapshotItemsByRowKey?.[row.rowKey];
    if (!snapshot) {
      return true;
    }

    const rowSignature = buildRowComparisonSignature(row);
    const snapshotSignature = buildSnapshotComparisonSignature(snapshot);
    if (rowSignature !== snapshotSignature) {
      return true;
    }
  }

  return false;
}

export function useSaveFlow({
  selectedParty,
  selectedRowsByType,
  snapshotItemsByRowKey = {},
  selectedSnapshotRef = '',
  signedInEmail,
  isAuthenticated,
  isAdminUser = false,
  mode,
  onAfterSave
}) {
  const [savingType, setSavingType] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [confirmState, setConfirmState] = useState(INITIAL_CONFIRM_STATE);

  const clearFeedback = useCallback(() => {
    setFeedback({ type: '', message: '' });
  }, []);

  const openConfirm = useCallback((type) => {
    setFeedback({ type: '', message: '' });

    const rows = type === 'owner'
      ? selectedRowsByType.ownerRows
      : selectedRowsByType.finalRows;

    const validationError = validateBeforeSave({
      type,
      rows,
      selectedParty,
      isAuthenticated,
      signedInEmail
    });

    if (validationError) {
      setFeedback({ type: 'error', message: validationError });
      return;
    }

    setConfirmState({
      open: true,
      type,
      rows,
      confirmationRows: buildConfirmationRows(rows),
      title: type === 'owner' ? 'Confirm Owner Approved Save' : 'Confirm Party Agreed Save',
      confirmLabel:
        type === 'owner'
          ? 'Yes, Save Owner Approved'
          : 'Yes, Save Party Agreed'
    });
  }, [
    selectedRowsByType,
    selectedParty,
    isAuthenticated,
    signedInEmail
  ]);

  const closeConfirm = useCallback(() => {
    if (savingType) {
      return;
    }
    setConfirmState(INITIAL_CONFIRM_STATE);
  }, [savingType]);

  const handleConfirmSave = useCallback(async () => {
    if (!confirmState.open || !confirmState.type) {
      return;
    }

    const sourceMode = mode === APP_MODES.SNAPSHOT ? 'SNAPSHOT' : 'FRESH';
    const type = confirmState.type;
    const adminSnapshotUpdateMode = Boolean(
      isAdminUser && sourceMode === 'SNAPSHOT' && String(selectedSnapshotRef || '').trim()
    );

    if (
      adminSnapshotUpdateMode &&
      !hasAdminSnapshotChanges(type, confirmState.rows, snapshotItemsByRowKey)
    ) {
      setFeedback({
        type: 'success',
        message: 'No changes detected. Existing reference was not updated.'
      });
      setConfirmState(INITIAL_CONFIRM_STATE);
      return;
    }

    setSavingType(type);

    let action = API_ACTIONS.SAVE_OWNER_APPROVAL;
    let payload = buildOwnerApprovalPayload({
      partyName: selectedParty,
      userEmail: signedInEmail,
      notes: '',
      sourceMode,
      selectedRows: confirmState.rows
    });

    if (type === 'final') {
      action = API_ACTIONS.SAVE_FINAL_ACTION;
      payload = buildFinalActionPayload({
        partyName: selectedParty,
        userEmail: signedInEmail,
        notes: '',
        sourceMode,
        actionTag: FINAL_ACTION_TAGS.PARTY_AGREED,
        selectedRows: confirmState.rows
      });
    }

    if (adminSnapshotUpdateMode) {
      payload.updateRefKey = selectedSnapshotRef;
      payload.requestUpdateExisting = true;
    }

    try {
      const response = await apiClient.post(action, payload);
      const data = response?.data || {};

      setFeedback({
        type: 'success',
        message: `Saved successfully. Ref: ${safeText(data.refKey, '-')}, Items: ${toNumberOrZero(data.itemCount)}`
      });

      const savedRowKeys = confirmState.rows.map((row) => row.rowKey);
      await onAfterSave?.({
        type,
        savedRowKeys,
        data
      });

      setConfirmState(INITIAL_CONFIRM_STATE);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Save failed. Please retry.'
      });
    } finally {
      setSavingType('');
    }
  }, [
    confirmState,
    mode,
    isAdminUser,
    snapshotItemsByRowKey,
    selectedSnapshotRef,
    selectedParty,
    signedInEmail,
    onAfterSave
  ]);

  const saveState = useMemo(() => {
    return {
      savingType,
      feedback,
      clearFeedback,
      confirmState,
      openConfirm,
      closeConfirm,
      handleConfirmSave
    };
  }, [
    savingType,
    feedback,
    clearFeedback,
    confirmState,
    openConfirm,
    closeConfirm,
    handleConfirmSave
  ]);

  return saveState;
}
