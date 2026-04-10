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

export function useSaveFlow({
  selectedParty,
  selectedRowsByType,
  signedInEmail,
  isAuthenticated,
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
