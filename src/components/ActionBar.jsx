import { memo } from 'react';

function ActionBar({
  isAuthenticated,
  isAdminUser = false,
  showSaveFinal = true,
  savingType,
  disabled,
  onSaveOwner,
  onSaveFinal,
  onCopyRates,
  onCopyPartyRates,
  copyRatesDisabled = false,
  copyRatesTooltip = '',
  copyPartyRatesDisabled = false,
  copyPartyRatesTooltip = '',
  auxiliaryNode
}) {
  const saveDisabled = disabled || !isAuthenticated;
  const copyDisabled = disabled || copyRatesDisabled;
  const copyPartyDisabled = disabled || copyPartyRatesDisabled;

  return (
    <section className="action-bar">
      <div className="action-bar__row action-bar__row--buttons">
        {auxiliaryNode}

        <div className="action-bar__buttons">
          <span title={copyRatesTooltip}>
            <button
              type="button"
              className="btn btn--secondary"
              data-tour="copy-rates-button"
              onClick={onCopyRates}
              disabled={copyDisabled}
            >
              Copy Rates
            </button>
          </span>

          {isAdminUser ? (
            <span title={copyPartyRatesTooltip}>
              <button
                type="button"
                className="btn btn--admin"
                data-tour="copy-party-rates-button"
                onClick={onCopyPartyRates}
                disabled={copyPartyDisabled}
              >
                Copy Party Rates
              </button>
            </span>
          ) : null}

          <button
            type="button"
            className="btn"
            data-tour="save-owner-button"
            onClick={onSaveOwner}
            disabled={saveDisabled || savingType === 'owner'}
          >
            {savingType === 'owner' ? 'Saving Owner...' : 'Save Owner Approved'}
          </button>

          {showSaveFinal ? (
            <button
              type="button"
              className="btn"
              data-tour="save-final-button"
              onClick={onSaveFinal}
              disabled={saveDisabled || savingType === 'final'}
            >
              {savingType === 'final' ? 'Saving Party Agreed...' : 'Save Party Agreed'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default memo(ActionBar);
