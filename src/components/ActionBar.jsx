import { memo } from 'react';

function ActionBar({
  isAuthenticated,
  savingType,
  disabled,
  onSaveOwner,
  filtersNode,
  auxiliaryNode
}) {
  const saveDisabled = disabled || !isAuthenticated;

  return (
    <section className="action-bar">
      <div className="action-bar__row action-bar__row--buttons">
        {filtersNode}
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
        </div>
      </div>
    </section>
  );
}

export default memo(ActionBar);
