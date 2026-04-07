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
  signedInEmail,
  finalActionTag
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
      : 'Select at least one Final Action row to save.';
  }

  if (
    type === 'final' &&
    !Object.values(FINAL_ACTION_TAGS).includes(String(finalActionTag || '').toUpperCase())
  ) {
    return 'Choose a valid final action tag (PARTY_AGREED or DISPATCHED).';
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
  const [notes, setNotes] = useState('');
  const [finalActionTag, setFinalActionTag] = useState(FINAL_ACTION_TAGS.PARTY_AGREED);
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
      signedInEmail,
      finalActionTag
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
      title: type === 'owner' ? 'Confirm Owner Approved Save' : 'Confirm Final Action Save',
      confirmLabel:
        type === 'owner'
          ? 'Yes, Save Owner Approved'
          : `Yes, Save ${String(finalActionTag).toUpperCase()}`
    });
  }, [
    selectedRowsByType,
    selectedParty,
    isAuthenticated,
    signedInEmail,
    finalActionTag
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
      notes,
      sourceMode,
      selectedRows: confirmState.rows
    });

    if (type === 'final') {
      action = API_ACTIONS.SAVE_FINAL_ACTION;
      payload = buildFinalActionPayload({
        partyName: selectedParty,
        userEmail: signedInEmail,
        notes,
        sourceMode,
        actionTag: finalActionTag,
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
    notes,
    finalActionTag,
    onAfterSave
  ]);

  const saveState = useMemo(() => {
    return {
      notes,
      setNotes,
      finalActionTag,
      setFinalActionTag,
      savingType,
      feedback,
      clearFeedback,
      confirmState,
      openConfirm,
      closeConfirm,
      handleConfirmSave
    };
  }, [
    notes,
    finalActionTag,
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

