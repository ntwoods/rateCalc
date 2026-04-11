import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from './components/AppShell';
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
  PORTAL_THEMES,
  RATE_BASIS,
  SNAPSHOT_VIEW_MODES
} from './constants/appConfig';
import { formatDate, safeText, toNumberOrZero } from './utils/formatters';
import './styles/app.css';

const THEME_STORAGE_KEY = 'portal_theme';

function getInitialTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (Object.values(PORTAL_THEMES).includes(raw)) {
      return raw;
    }
  } catch (error) {
    // Ignore storage unavailability and fallback to default theme.
  }
  return PORTAL_THEMES.DEFAULT;
}

function App() {
  const auth = useAuth();

  const { status, health, metadata } = useBackendBootstrap({
    includeBootstrap: false
  });

  const {
    settings,
    parties,
    loading: bootstrapLoading,
    error: bootstrapError,
    hasData
  } = useBootstrap();

  const [selectedParty, setSelectedParty] = useState('');
  const [selectedSnapshotRef, setSelectedSnapshotRef] = useState('');
  const [mode, setMode] = useState(APP_MODES.FRESH);
  const [productSearch, setProductSearch] = useState('');
  const [snapshotViewMode, setSnapshotViewMode] = useState(SNAPSHOT_VIEW_MODES.OVERLAY);
  const [rateBasis, setRateBasis] = useState(RATE_BASIS.LATEST);
  const [theme, setTheme] = useState(getInitialTheme);
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
    rateBasis,
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
    if (!selectedSnapshotRef) {
      return;
    }
    setContextPanelOpen(true);
  }, [selectedSnapshotRef]);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Ignore storage failures.
    }
  }, [theme]);

  const signedInEmail = String(auth.user?.email || '').trim();
  const partyCount = toNumberOrZero(parties.length);
  const toolbarDisabled = status !== BACKEND_STATUS.CONNECTED;
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

  const themeOptions = useMemo(() => {
    return [
      { value: PORTAL_THEMES.DEFAULT, label: 'Default Gloss' },
      { value: PORTAL_THEMES.SUNSET, label: 'Sunset' },
      { value: PORTAL_THEMES.NT_WOOD, label: 'NT Wood' },
      { value: PORTAL_THEMES.AURORA, label: 'Aurora Mint' }
    ];
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

  const handleToggleRateBasis = useCallback(() => {
    setRateBasis((prev) => (prev === RATE_BASIS.LATEST ? RATE_BASIS.OLD : RATE_BASIS.LATEST));
  }, []);

  const rateBasisButtonLabel = rateBasis === RATE_BASIS.LATEST ? 'Show Old List' : 'Show Latest List';
  const rateBasisText = rateBasis === RATE_BASIS.LATEST ? 'Latest List Visible' : 'Old List Visible';

  return (
    <div className={`theme-root theme-${theme}`}>
      <AppShell
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
                headerActions={(
                  <div className="toolbar__utilities">
                    <div className="toolbar__utility-card toolbar__utility-card--theme">
                      <div className="theme-switcher theme-switcher--compact">
                        <label htmlFor="theme-select">Theme</label>
                        <select
                          id="theme-select"
                          value={theme}
                          onChange={(event) => setTheme(event.target.value)}
                        >
                          {themeOptions.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="toolbar__utility-card toolbar__utility-card--user">
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
                        className="user-panel--embedded"
                      />
                    </div>
                  </div>
                )}
              />
            )}

          </section>

          <ActionBar
            isAuthenticated={auth.isAuthenticated}
            savingType={saveFlow.savingType}
            disabled={toolbarDisabled || productsLoading || snapshotLoading}
            onSaveOwner={handleOpenOwnerConfirm}
            onSaveFinal={handleOpenFinalConfirm}
            auxiliaryNode={(
              <div className="rate-source-bar">
                <span className="rate-source-bar__active">{rateBasisText}</span>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={handleToggleRateBasis}
                >
                  {rateBasisButtonLabel}
                </button>
              </div>
            )}
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
            rateBasis={rateBasis}
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
    </div>
  );
}

export default App;

