import { memo } from 'react';
import { APP_MODES } from '../constants/appConfig';

function SnapshotSelector({
  mode,
  value,
  onChange,
  options = [],
  disabled = false,
  loading = false
}) {
  const inSnapshotMode = mode === APP_MODES.SNAPSHOT;
  const isDisabled = disabled || !inSnapshotMode || loading;

  let placeholder = 'Select party to enable';
  if (!disabled && !inSnapshotMode) {
    placeholder = 'Switch to Snapshot Mode';
  } else if (!disabled && inSnapshotMode && loading) {
    placeholder = 'Loading saved references...';
  } else if (!disabled && inSnapshotMode) {
    placeholder = options.length > 0 ? 'Select saved reference' : 'No saved references yet';
  }

  return (
    <div className="control-card">
      <label htmlFor="snapshot-ref">Saved Reference</label>
      <select
        id="snapshot-ref"
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={isDisabled}
      >
        <option value="">{placeholder}</option>
        {options.map((item) => {
          const refKey = item?.refKey || item?.value || '';
          const label = item?.label || item?.refKey || '';
          if (!refKey) {
            return null;
          }

          return (
            <option key={refKey} value={refKey}>
              {label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export default memo(SnapshotSelector);
