import { useCallback, useEffect, useMemo, useState } from 'react';
import { Joyride, STATUS } from 'react-joyride';
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
  const [tourRun, setTourRun] = useState(false);
  const [tourKey, setTourKey] = useState(0);
  const [autoTourStarted, setAutoTourStarted] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);

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

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setAutoTourStarted(false);
      setTourRun(false);
    }
  }, [auth.isAuthenticated]);

  useEffect(() => {
    if (!selectedSnapshotRef) {
      return;
    }
    setContextPanelOpen(true);
  }, [selectedSnapshotRef]);

  useEffect(() => {
    if (
      autoTourStarted ||
      !auth.isAuthenticated ||
      status !== BACKEND_STATUS.CONNECTED ||
      bootstrapLoading
    ) {
      return;
    }

    setContextPanelOpen(true);
    setTourKey((prev) => prev + 1);
    setTourRun(true);
    setAutoTourStarted(true);
  }, [autoTourStarted, auth.isAuthenticated, status, bootstrapLoading]);

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

  const tourSteps = useMemo(() => {
    return [
      {
        target: '[data-tour="portal-header"]',
        title: 'Portal Overview',
        content: 'Use this screen to calculate, discuss, approve, and finalize party-wise rates in one workflow.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="mode-toggle"]',
        title: 'Choose Workflow Mode',
        content: 'Switch between Fresh Calculation Mode and Load Saved Snapshot Mode based on how you want to work.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="party-selector"]',
        title: 'Select Party',
        content: 'Pick the party first to load latest history context and save against the correct account.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="snapshot-selector"]',
        title: 'Open Saved Reference',
        content: 'In Snapshot Mode, select a saved reference to reopen exact previously saved values.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="product-search"]',
        title: 'Find Products Fast',
        content: 'Search product name to jump directly to the rows you need to discuss.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="special-discount-column"]',
        title: 'Special Discount Rule',
        content: 'Special discount is category-wise. Editing one row updates all rows in that category.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="gst-column"]',
        title: 'GST Mode',
        content: 'Choose GST mode per category to control how tax is applied in final rate calculation.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="freight-column"]',
        title: 'Freight Mode',
        content: 'Set freight mode here. Freight choice is part of the saved rate discussion history.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="cd-column"]',
        title: 'CD Mode',
        content: 'Select CD mode and enter CD % when needed before saving owner or final actions.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="owner-row-actions"]',
        title: 'Owner Approval Row Selection',
        content: 'Mark rows for owner approval and final action separately using row-level checkboxes.',
        placement: 'bottom'
      },
      {
        target: '[data-tour="final-action-tag"]',
        title: 'Final Action Tag',
        content: 'Choose PARTY_AGREED or DISPATCHED before the final save step.',
        placement: 'top'
      },
      {
        target: '[data-tour="notes-field"]',
        title: 'Notes',
        content: 'Add short notes for negotiation context, owner remarks, or dispatch comments.',
        placement: 'top'
      },
      {
        target: '[data-tour="save-owner-button"]',
        title: 'Save Owner Approved',
        content: 'Use this to send selected rows for owner-approved record creation.',
        placement: 'top'
      },
      {
        target: '[data-tour="save-final-button"]',
        title: 'Save Party Agreed / Dispatched',
        content: 'Use this once discussion is finalized. Dispatched rows with special discount are highlighted in green.',
        placement: 'top'
      },
      {
        target: '[data-tour="context-panel"]',
        title: 'History and Reopen Tools',
        content: 'Expand this section to review history, inspect snapshots, and reopen saved discussions later for finalization.',
        placement: 'top'
      }
    ];
  }, []);

  const handleTourCallback = useCallback((event) => {
    if (event.status === STATUS.FINISHED || event.status === STATUS.SKIPPED) {
      setTourRun(false);
    }
  }, []);

  const startTour = useCallback(() => {
    setContextPanelOpen(true);
    setTourKey((prev) => prev + 1);
    setTourRun(true);
  }, []);

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
      <Joyride
        key={tourKey}
        run={tourRun}
        steps={tourSteps}
        continuous
        showProgress
        showSkipButton
        scrollToFirstStep
        disableOverlayClose
        spotlightPadding={8}
        callback={handleTourCallback}
        locale={{
          back: 'Prev',
          close: 'Close',
          last: 'Finish',
          next: 'Next',
          nextLabelWithProgress: 'Next ({step}/{steps})',
          skip: 'Skip Guide'
        }}
        styles={{
          options: {
            arrowColor: '#ffffff',
            backgroundColor: '#ffffff',
            overlayColor: 'rgba(14, 43, 72, 0.34)',
            primaryColor: '#1d5f97',
            textColor: '#15395d',
            zIndex: 1400
          },
          buttonClose: {
            color: '#6a88a7'
          },
          buttonBack: {
            color: '#2f5f8a'
          }
        }}
      />

      <AppShell
        topBar={(
          <TopBar
            statusNode={(
              <div className="top-bar__status-group">
                <span className="backend-pill">{status.toUpperCase()}</span>
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  data-tour="tour-entry-top"
                  onClick={startTour}
                >
                  Help / Start Tour
                </button>
              </div>
            )}
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
        footer={(
          <div className="footer-grid">
            <span>{APP_CONFIG.APP_NAME}</span>
            <span>Frontend {APP_CONFIG.APP_VERSION}</span>
            <span>Updated: {formatDate(metadata.timestamp, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        )}
      >
        <section className="content-card content-card--workspace" data-tour="portal-overview">
          <div className="workspace-intro">
            <div>
              <h2>Rate Discussion Workspace</h2>
              <p className="workspace-intro__subtitle">Compact calculation flow for owner approval and final dispatch workflow.</p>
            </div>
            <div className="workspace-intro__chips">
              <span className="meta-chip"><strong>Mode:</strong> {modeLabel}</span>
              <span className="meta-chip"><strong>Party:</strong> {safeText(selectedParty, 'Not selected')}</span>
              <span className="meta-chip"><strong>Rows:</strong> {productsLoading ? '...' : toNumberOrZero(displayedProducts.length)}</span>
              <span className="meta-chip"><strong>Owner Select:</strong> {toNumberOrZero(rateEditor.selectedCounts.ownerCount)}</span>
              <span className="meta-chip"><strong>Final Select:</strong> {toNumberOrZero(rateEditor.selectedCounts.finalCount)}</span>
            </div>
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

          <section className="discussion-control-bar" data-tour="discussion-control-bar">
            <div className="discussion-control-bar__head">
              <h3>Discussion Control Bar</h3>
              <div className="tour-entry-inline">
                <span>Need help?</span>
                <button type="button" className="btn-link btn-link--interactive" onClick={startTour}>Start tour</button>
              </div>
            </div>

            {bootstrapLoading ? (
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

            <div className="control-hints">
              <span className="hint-pill">Select a party to load rate context</span>
              <span className="hint-pill">Search product name to jump to a row</span>
              <span className="hint-pill">Special discount applies category-wise</span>
              <span className="hint-pill">Save for owner review or final dispatch workflow</span>
              {mode === APP_MODES.SNAPSHOT && !selectedSnapshotRef ? (
                <span className="hint-pill hint-pill--warn">Choose a saved reference in snapshot mode</span>
              ) : null}
            </div>
          </section>

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

          <details
            className="context-panel"
            data-tour="context-panel"
            open={contextPanelOpen}
            onToggle={(event) => setContextPanelOpen(event.currentTarget.open)}
          >
            <summary>Context / History / Snapshot Tools</summary>
            <div className="context-panel__body">
              <div className="context-meta-grid">
                <span><strong>Backend App:</strong> {safeText(metadata.app, '-')}</span>
                <span><strong>Active Parties:</strong> {bootstrapLoading ? '...' : partyCount}</span>
                <span><strong>Saved Ref:</strong> {safeText(selectedSnapshotRef, 'Not selected')}</span>
                <span><strong>Category Rules:</strong> One special discount per category</span>
                <span><strong>Settings Keys:</strong> {toNumberOrZero(Object.keys(settings || {}).length)}</span>
              </div>

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

              <div className="table-footnote">
                <span>
                  Scanned rows: {toNumberOrZero(productStats?.totalRowsScanned)} | Valid returned: {toNumberOrZero(productStats?.validProductsReturned)} | Invalid skipped: {toNumberOrZero(productStats?.invalidRowsSkipped)}
                </span>
              </div>

              <details className="debug-panel">
                <summary>Debug Health Payload</summary>
                <pre className="json-preview">{JSON.stringify(health || {}, null, 2)}</pre>
              </details>
            </div>
          </details>
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

