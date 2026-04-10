import { memo } from 'react';

function ActionBar({
  selectedParty,
  isAuthenticated,
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
      {!isAuthenticated && saveGuardMessage ? (
        <div className="inline-alert inline-alert--soft action-bar__guard" role="status">
          {saveGuardMessage}
        </div>
      ) : null}

      <div className="action-bar__row action-bar__row--buttons">
        <div className="action-bar__summary">
          <span><strong>Party:</strong> {selectedParty || 'Not selected'}</span>
          <span><strong>Owner Rows:</strong> {ownerSelectedCount}</span>
          <span><strong>Party Agreed Rows:</strong> {finalSelectedCount}</span>
        </div>

        <div className="action-bar__buttons">
          <button
            type="button"
            className="btn"
            data-tour="save-owner-button"
            onClick={onSaveOwner}
            disabled={saveDisabled || savingType === 'owner'}
          >
            {savingType === 'owner' ? 'Saving Owner...' : 'Save Owner Approved'}
          </button>

          <button
            type="button"
            className="btn"
            data-tour="save-final-button"
            onClick={onSaveFinal}
            disabled={saveDisabled || savingType === 'final'}
          >
            {savingType === 'final' ? 'Saving Party Agreed...' : 'Save Party Agreed'}
          </button>
        </div>
      </div>
    </section>
  );
}

export default memo(ActionBar);
