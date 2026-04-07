import { memo } from 'react';
import ModeToggle from './ModeToggle';
import PartySelector from './PartySelector';
import SearchBox from './SearchBox';
import SnapshotSelector from './SnapshotSelector';

function Toolbar({
  mode,
  onModeChange,
  selectedParty,
  onPartyChange,
  selectedSnapshotRef,
  onSnapshotChange,
  productSearch,
  onProductSearchChange,
  parties,
  snapshots,
  snapshotsLoading,
  loading,
  disabled
}) {
  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <ModeToggle value={mode} onChange={onModeChange} disabled={disabled} />
      </div>

      <div className="toolbar__row top-controls-grid top-controls-grid--phase2b">
        <PartySelector
          parties={parties}
          value={selectedParty}
          onChange={onPartyChange}
          loading={loading}
          disabled={disabled}
        />

        <SnapshotSelector
          mode={mode}
          value={selectedSnapshotRef}
          onChange={onSnapshotChange}
          options={snapshots}
          loading={snapshotsLoading}
          disabled={disabled || !selectedParty}
        />

        <SearchBox
          value={productSearch}
          onChange={onProductSearchChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default memo(Toolbar);
