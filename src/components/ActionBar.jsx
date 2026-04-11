import { memo } from 'react';

function ActionBar({
  isAuthenticated,
  savingType,
  disabled,
  onSaveOwner,
  onSaveFinal,
  auxiliaryNode
}) {
  const saveDisabled = disabled || !isAuthenticated;

  return (
    <section className="action-bar">
      <div className="action-bar__row action-bar__row--buttons">
        {auxiliaryNode}

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
