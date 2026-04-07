import { memo } from 'react';
import { APP_MODES } from '../constants/appConfig';

function ModeToggle({ value = APP_MODES.FRESH, onChange, disabled = false }) {
  return (
    <div className="mode-toggle" role="group" aria-label="Calculation mode">
      <button
        type="button"
        className={`mode-toggle__btn ${value === APP_MODES.FRESH ? 'mode-toggle__btn--active' : ''}`}
        onClick={() => onChange?.(APP_MODES.FRESH)}
        disabled={disabled}
      >
        Fresh Calculation Mode
      </button>

      <button
        type="button"
        className={`mode-toggle__btn ${value === APP_MODES.SNAPSHOT ? 'mode-toggle__btn--active' : ''}`}
        onClick={() => onChange?.(APP_MODES.SNAPSHOT)}
        disabled={disabled}
      >
        Load Saved Snapshot Mode
      </button>
    </div>
  );
}

export default memo(ModeToggle);
