import { memo } from 'react';
import { FINAL_ACTION_TAGS } from '../constants/appConfig';

function ActionBar({
  selectedParty,
  userEmail,
  isAuthenticated,
  notes,
  onNotesChange,
  finalActionTag,
  onFinalActionTagChange,
  ownerSelectedCount,
  finalSelectedCount,
  savingType,
  saveGuardMessage,
  disabled,
  onSaveOwner,
  onSaveFinal
}) {
  const saveDisabled = disabled || !isAuthenticated;

  return (
    <section className="action-bar">
      <div className="action-bar__row action-bar__row--fields">
        <div className="control-card">
          <label htmlFor="signed-in-email">Signed-in User</label>
          <input
            id="signed-in-email"
            type="text"
            value={userEmail}
            placeholder="Sign in to enable save actions"
            disabled
          />
        </div>

        <div className="control-card">
          <label htmlFor="save-notes">Notes</label>
          <input
            id="save-notes"
            type="text"
            value={notes}
            onChange={(event) => onNotesChange?.(event.target.value)}
            placeholder="Optional note"
            disabled={disabled}
          />
        </div>

        <div className="control-card">
          <label htmlFor="final-action-tag">Final Action Tag</label>
          <select
            id="final-action-tag"
            value={finalActionTag}
            onChange={(event) => onFinalActionTagChange?.(event.target.value)}
            disabled={disabled}
          >
            <option value={FINAL_ACTION_TAGS.PARTY_AGREED}>{FINAL_ACTION_TAGS.PARTY_AGREED}</option>
            <option value={FINAL_ACTION_TAGS.DISPATCHED}>{FINAL_ACTION_TAGS.DISPATCHED}</option>
          </select>
        </div>
      </div>

      {!isAuthenticated && saveGuardMessage ? (
        <div className="inline-alert inline-alert--soft action-bar__guard" role="status">
          {saveGuardMessage}
        </div>
      ) : null}

      <div className="action-bar__row action-bar__row--buttons">
        <div className="action-bar__summary">
          <span><strong>Party:</strong> {selectedParty || 'Not selected'}</span>
          <span><strong>Owner Rows:</strong> {ownerSelectedCount}</span>
          <span><strong>Final Rows:</strong> {finalSelectedCount}</span>
        </div>

        <div className="action-bar__buttons">
          <button
            type="button"
            className="btn"
            onClick={onSaveOwner}
            disabled={saveDisabled || savingType === 'owner'}
          >
            {savingType === 'owner' ? 'Saving Owner...' : 'Save Owner Approved'}
          </button>

          <button
            type="button"
            className="btn"
            onClick={onSaveFinal}
            disabled={saveDisabled || savingType === 'final'}
          >
            {savingType === 'final' ? 'Saving Final...' : 'Save Party Agreed / Dispatched'}
          </button>
        </div>
      </div>
    </section>
  );
}

export default memo(ActionBar);
