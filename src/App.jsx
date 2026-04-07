import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from './components/AppShell';
import TopBar from './components/TopBar';
import StatusBanner from './components/StatusBanner';
import Toolbar from './components/Toolbar';
import RateTable from './components/RateTable';
import HistoryPanel from './components/HistoryPanel';
import SnapshotSummary from './components/SnapshotSummary';
import ActionBar from './components/ActionBar';
import ConfirmModal from './components/ConfirmModal';
import UserPanel from './components/UserPanel';
import InlineError from './components/InlineError';
import NoPartySelected from './components/NoPartySelected';
import Toast from './components/Toast';
import { useAuth } from './hooks/useAuth';
import { useBackendBootstrap } from './hooks/useBackendBootstrap';
import { useBootstrap } from './hooks/useBootstrap';
import { useProducts } from './hooks/useProducts';
import { useRateEditor } from './hooks/useRateEditor';
import { usePartyHistory } from './hooks/usePartyHistory';
import { useRateGridView } from './hooks/useRateGridView';
import { useSaveFlow } from './hooks/useSaveFlow';
import {
  APP_CONFIG,
  APP_MODES,
  BACKEND_STATUS,
  SNAPSHOT_VIEW_MODES
} from './constants/appConfig';
import { formatDate, safeText, toNumberOrZero } from './utils/formatters';
import './styles/app.css';

function App() {
  const auth = useAuth();

  const { status, error: healthError, health, metadata, retry: retryHealth } = useBackendBootstrap({
    includeBootstrap: false
  });

  const {
    settings,
    parties,
    loading: bootstrapLoading,
    error: bootstrapError,
    hasData,
    reload: reloadBootstrap
  } = useBootstrap();

  const [selectedParty, setSelectedParty] = useState('');
  const [selectedSnapshotRef, setSelectedSnapshotRef] = useState('');
  const [mode, setMode] = useState(APP_MODES.FRESH);
  const [productSearch, setProductSearch] = useState('');
  const [snapshotViewMode, setSnapshotViewMode] = useState(SNAPSHOT_VIEW_MODES.OVERLAY);

  const {
    products,
    loading: productsLoading,
    error: productsError,
    stats: productStats,
    reload: reloadProducts
  } = useProducts({
    search: productSearch,
    enabled: status === BACKEND_STATUS.CONNECTED,
    serverFilter: true
  });

  const {
    historyLoading,
    historyError,
    latestHistoryItems,
    latestHistoryByRowKey,
    snapshotRefs,
    snapshotLoading,
    snapshotError,
    snapshotHeader,
    snapshotItems,
    snapshotItemsByRowKey,
    reloadHistory,
    reloadSnapshot,
    makeRowKey
  } = usePartyHistory({
    selectedParty,
    selectedSnapshotRef
  });

  const rateEditor = useRateEditor({
    products,
    settings
  });

  const {
    activeSnapshotMap,
    displayedProducts,
    mappedSnapshotCount,
    unmatchedSnapshotCount,
    selectedRowsByType
  } = useRateGridView({
    products,
    settings,
    mode,
    selectedSnapshotRef,
    snapshotViewMode,
    snapshotError,
    snapshotItems,
    snapshotItemsByRowKey,
    makeRowKey,
    rateEditor
  });

  useEffect(() => {
    setSelectedSnapshotRef('');
  }, [selectedParty]);

  useEffect(() => {
    if (mode === APP_MODES.FRESH) {
      setSelectedSnapshotRef('');
    }
  }, [mode]);

  useEffect(() => {
    setSnapshotViewMode(SNAPSHOT_VIEW_MODES.OVERLAY);
  }, [selectedSnapshotRef]);

  const signedInEmail = String(auth.user?.email || '').trim();
  const partyCount = toNumberOrZero(parties.length);
  const toolbarDisabled = status !== BACKEND_STATUS.CONNECTED;
  const modeLabel = mode === APP_MODES.FRESH ? 'Fresh Calculation Mode' : 'Load Saved Snapshot Mode';

  const statusMessage = useMemo(() => {
    if (status === BACKEND_STATUS.CONNECTED) {
      if (bootstrapError) {
        return `Backend connected. ${bootstrapError}`;
      }
      return `Backend connected (${safeText(metadata.backendVersion, APP_CONFIG.APP_VERSION)})`;
    }

    if (status === BACKEND_STATUS.FAILED) {
      return healthError || 'Unable to reach backend.';
    }

    return 'Running startup health check...';
  }, [status, bootstrapError, metadata.backendVersion, healthError]);

  const snapshotOptions = useMemo(() => {
    return snapshotRefs.map((item) => {
      const dateText = formatDate(item.snapshotDateTime, {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      const actionText = safeText(item.actionTag, 'N/A');
      const countText = toNumberOrZero(item.itemCount);

      return {
        ...item,
        value: item.refKey,
        label: `${dateText} | ${actionText} | ${countText} rows`
      };
    });
  }, [snapshotRefs]);

  const handleAfterSave = useCallback(async ({
    type,
    savedRowKeys
  }) => {
    rateEditor.actions.clearSelections(type === 'owner' ? 'owner' : 'final', savedRowKeys);
    reloadHistory();
    if (selectedSnapshotRef) {
      reloadSnapshot();
    }
  }, [rateEditor.actions, reloadHistory, reloadSnapshot, selectedSnapshotRef]);

  const saveFlow = useSaveFlow({
    selectedParty,
    selectedRowsByType,
    signedInEmail,
    isAuthenticated: auth.isAuthenticated,
    mode,
    onAfterSave: handleAfterSave
  });

  const handleOpenOwnerConfirm = useCallback(() => {
    saveFlow.openConfirm('owner');
  }, [saveFlow.openConfirm]);

  const handleOpenFinalConfirm = useCallback(() => {
    saveFlow.openConfirm('final');
  }, [saveFlow.openConfirm]);

  const handleRefreshAll = useCallback(() => {
    retryHealth();
    reloadBootstrap();
    reloadProducts();
    reloadHistory();
    reloadSnapshot();
  }, [retryHealth, reloadBootstrap, reloadProducts, reloadHistory, reloadSnapshot]);

  return (
    <>
      <AppShell
        topBar={(
          <TopBar
            statusNode={<span className="backend-pill">{status.toUpperCase()}</span>}
            userNode={(
              <UserPanel
                authStatus={auth.status}
                user={auth.user}
                loading={auth.isLoading}
                isAuthenticated={auth.isAuthenticated}
                isUnavailable={auth.isUnavailable}
                error={auth.error}
                onSignIn={auth.signIn}
                onSignOut={auth.signOut}
                onRetry={auth.reload}
                setSignInHost={auth.setSignInHost}
              />
            )}
          />
        )}
        statusBanner={(
          <StatusBanner
            status={status}
            message={statusMessage}
            onRetry={handleRefreshAll}
          />
        )}
        topControls={bootstrapLoading ? (
          <div className="toolbar-skeleton" aria-hidden="true">
            <div className="skeleton-line" />
            <div className="skeleton-grid">
              <div className="skeleton-box" />
              <div className="skeleton-box" />
              <div className="skeleton-box" />
            </div>
          </div>
        ) : (
          <Toolbar
            mode={mode}
            onModeChange={setMode}
            selectedParty={selectedParty}
            onPartyChange={setSelectedParty}
            selectedSnapshotRef={selectedSnapshotRef}
            onSnapshotChange={setSelectedSnapshotRef}
            productSearch={productSearch}
            onProductSearchChange={setProductSearch}
            parties={parties}
            snapshots={snapshotOptions}
            snapshotsLoading={historyLoading}
            loading={bootstrapLoading}
            disabled={toolbarDisabled}
          />
        )}
        footer={(
          <div className="footer-grid">
            <span>{APP_CONFIG.APP_NAME}</span>
            <span>Frontend {APP_CONFIG.APP_VERSION}</span>
            <span>Updated: {formatDate(metadata.timestamp, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        )}
      >
        <section className="content-card">
          <h2>Rate Discussion Grid</h2>
          <p>Party history, snapshot loading, live edits, and save workflows are integrated. Backend remains source of truth at save time.</p>

          <div className="stats-grid">
            <article className="stat-box">
              <h3>Backend App</h3>
              <p>{safeText(metadata.app, '-')}</p>
            </article>

            <article className="stat-box">
              <h3>Active Parties</h3>
              <p>{bootstrapLoading ? '...' : partyCount}</p>
            </article>

            <article className="stat-box">
              <h3>Products Visible</h3>
              <p>{productsLoading ? '...' : toNumberOrZero(displayedProducts.length)}</p>
            </article>
          </div>

          <div className="state-hints">
            {!selectedParty ? <NoPartySelected /> : null}
            {!productSearch ? <p className="hint-row">Search products by name.</p> : null}
            {mode === APP_MODES.SNAPSHOT && !selectedSnapshotRef ? (
              <p className="hint-row">Choose a saved reference in snapshot mode.</p>
            ) : null}
          </div>

          <div className="selection-summary">
            <span><strong>Mode:</strong> {modeLabel}</span>
            <span><strong>Party:</strong> {safeText(selectedParty, 'Not selected')}</span>
            <span><strong>Saved Ref:</strong> {safeText(selectedSnapshotRef, 'Not selected')}</span>
            <span><strong>Product Search:</strong> {safeText(productSearch, 'Not entered')}</span>
          </div>

          <div className="selection-summary">
            <span><strong>Owner Selected:</strong> {toNumberOrZero(rateEditor.selectedCounts.ownerCount)}</span>
            <span><strong>Final Action Selected:</strong> {toNumberOrZero(rateEditor.selectedCounts.finalCount)}</span>
            <span><strong>Settings Keys:</strong> {toNumberOrZero(Object.keys(settings || {}).length)}</span>
            <span><strong>Category Rules:</strong> One special discount per category</span>
          </div>

          <InlineError message={bootstrapError} variant="soft" />

          {!bootstrapLoading && !hasData ? (
            <InlineError
              message="Bootstrap returned empty data. Confirm backend seed/setup state."
            />
          ) : null}

          <InlineError
            message={!auth.isAuthenticated ? auth.error : ''}
            variant="soft"
            role="status"
          />

          <HistoryPanel
            selectedParty={selectedParty}
            loading={historyLoading}
            error={historyError}
            historyCount={latestHistoryItems.length}
            snapshotCount={snapshotRefs.length}
            onReload={reloadHistory}
            latestHistorySample={latestHistoryItems[0]}
          />

          <SnapshotSummary
            mode={mode}
            selectedSnapshotRef={selectedSnapshotRef}
            snapshotLoading={snapshotLoading}
            snapshotError={snapshotError}
            snapshotHeader={snapshotHeader}
            mappedCount={mappedSnapshotCount}
            unmatchedCount={unmatchedSnapshotCount}
            viewMode={snapshotViewMode}
            onViewModeChange={setSnapshotViewMode}
          />

          <ActionBar
            selectedParty={selectedParty}
            userEmail={signedInEmail}
            isAuthenticated={auth.isAuthenticated}
            notes={saveFlow.notes}
            onNotesChange={saveFlow.setNotes}
            finalActionTag={saveFlow.finalActionTag}
            onFinalActionTagChange={saveFlow.setFinalActionTag}
            ownerSelectedCount={toNumberOrZero(selectedRowsByType.ownerRows.length)}
            finalSelectedCount={toNumberOrZero(selectedRowsByType.finalRows.length)}
            savingType={saveFlow.savingType}
            saveGuardMessage="Sign in to enable save actions. Read-only browsing stays available."
            disabled={toolbarDisabled || productsLoading || snapshotLoading}
            onSaveOwner={handleOpenOwnerConfirm}
            onSaveFinal={handleOpenFinalConfirm}
          />

          <RateTable
            products={displayedProducts}
            settings={settings}
            loading={
              status === BACKEND_STATUS.CONNECTED
                ? productsLoading ||
                  (mode === APP_MODES.SNAPSHOT && selectedSnapshotRef && snapshotLoading)
                : false
            }
            error={productsError}
            search={productSearch}
            onRetry={reloadProducts}
            editor={rateEditor}
            mode={mode}
            selectedSnapshotRef={selectedSnapshotRef}
            historyByRowKey={latestHistoryByRowKey}
            snapshotItemsByRowKey={activeSnapshotMap}
          />

          <div className="table-footnote">
            <span>
              Scanned rows: {toNumberOrZero(productStats?.totalRowsScanned)} | Valid returned: {toNumberOrZero(productStats?.validProductsReturned)} | Invalid skipped: {toNumberOrZero(productStats?.invalidRowsSkipped)}
            </span>
          </div>

          <pre className="json-preview">{JSON.stringify(health || {}, null, 2)}</pre>
        </section>
      </AppShell>

      <ConfirmModal
        open={saveFlow.confirmState.open}
        title={saveFlow.confirmState.title}
        partyName={selectedParty}
        itemCount={saveFlow.confirmState.rows.length}
        rows={saveFlow.confirmState.confirmationRows}
        confirmLabel={saveFlow.confirmState.confirmLabel}
        loading={saveFlow.savingType === saveFlow.confirmState.type}
        onCancel={saveFlow.closeConfirm}
        onConfirm={saveFlow.handleConfirmSave}
      />

      <Toast
        open={Boolean(saveFlow.feedback.message)}
        type={saveFlow.feedback.type === 'error' ? 'error' : 'success'}
        message={saveFlow.feedback.message}
        onClose={saveFlow.clearFeedback}
      />
    </>
  );
}

export default App;
