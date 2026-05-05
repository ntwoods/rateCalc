import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from './components/AppShell';
import RateTable from './components/RateTable';
import HistoryPanel from './components/HistoryPanel';
import SnapshotSummary from './components/SnapshotSummary';
import ActionBar from './components/ActionBar';
import ConfirmModal from './components/ConfirmModal';
import UserPanel from './components/UserPanel';
import InlineError from './components/InlineError';
import Toast from './components/Toast';
import ModeToggle from './components/ModeToggle';
import PartySelector from './components/PartySelector';
import SearchBox from './components/SearchBox';
import SnapshotSelector from './components/SnapshotSelector';
import { useAuth } from './hooks/useAuth';
import { useUserRole } from './hooks/useUserRole';
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
  SPECIAL_SNAPSHOT_REFS,
  SNAPSHOT_VIEW_MODES
} from './constants/appConfig';
import { formatDate, safeText, toNumberOrZero } from './utils/formatters';
import {
  buildOwnerApprovedRatesCopyData,
  copyPlainTextToClipboard
} from './utils/copyRates';
import {
  buildCopyPartyRatesImageData,
  copyPartyRatesImage
} from './utils/copyPartyRatesImage';
import {
  buildOwnerApprovedExportRows,
  exportOwnerApprovedRatesToXlsx
} from './utils/exportRates';
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

function normalizeActionTag(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function App() {
  const auth = useAuth();
  const signedInEmail = String(auth.user?.email || '').trim().toLowerCase();

  const { status, health, metadata } = useBackendBootstrap({
    includeBootstrap: false
  });

  const userRole = useUserRole({
    userEmail: signedInEmail,
    enabled: auth.isAuthenticated && status === BACKEND_STATUS.CONNECTED
  });
  const isAdminUser = Boolean(userRole.isAdmin);

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
  const [copyFeedback, setCopyFeedback] = useState({ type: '', message: '' });
  const [adminAutoLoadPartyKey, setAdminAutoLoadPartyKey] = useState('');

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

  const showAllRatesActive = selectedSnapshotRef === SPECIAL_SNAPSHOT_REFS.SHOW_ALL_RATES;
  const gridProducts = useMemo(() => {
    if (!showAllRatesActive) {
      return products;
    }
    return snapshotItems.map((item) => ({
      rowKey: item.rowKey,
      partyName: item.partyName,
      category: item.category,
      product: item.product,
      paymentTerms: item.paymentTerms,
      latestListPrice: item.latestListPrice,
      latestWEF: item.latestWEF,
      previousListPrice: item.previousListPrice,
      previousWEF: item.previousWEF
    }));
  }, [showAllRatesActive, products, snapshotItems]);

  const rateEditor = useRateEditor({
    products: gridProducts,
    settings,
    ownerBulkByCategoryEnabled: true
  });

  const {
    activeSnapshotMap,
    displayedProducts,
    mappedSnapshotCount,
    unmatchedSnapshotCount,
    selectedRowsByType
  } = useRateGridView({
    products: gridProducts,
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
    setAdminAutoLoadPartyKey('');
  }, [selectedParty, isAdminUser]);

  useEffect(() => {
    if (!isAdminUser) {
      return;
    }

    const partyKey = String(selectedParty || '').trim().toLowerCase();
    if (!partyKey || historyLoading || adminAutoLoadPartyKey === partyKey) {
      return;
    }

    const latestOwnerSnapshot = snapshotRefs.find(
      (snapshot) => normalizeActionTag(snapshot?.actionTag) === 'OWNER_APPROVED'
    );

    if (latestOwnerSnapshot?.refKey) {
      if (mode !== APP_MODES.SNAPSHOT) {
        setMode(APP_MODES.SNAPSHOT);
      }
      if (selectedSnapshotRef !== latestOwnerSnapshot.refKey) {
        setSelectedSnapshotRef(latestOwnerSnapshot.refKey);
      }
    }

    setAdminAutoLoadPartyKey(partyKey);
  }, [
    isAdminUser,
    selectedParty,
    historyLoading,
    snapshotRefs,
    adminAutoLoadPartyKey,
    mode,
    selectedSnapshotRef
  ]);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Ignore storage failures.
    }
  }, [theme]);

  const partyCount = toNumberOrZero(parties.length);
  const toolbarDisabled = status !== BACKEND_STATUS.CONNECTED;
  const snapshotOptions = useMemo(() => {
    const options = snapshotRefs.map((item) => {
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

    if (selectedParty) {
      return [
        {
          refKey: SPECIAL_SNAPSHOT_REFS.SHOW_ALL_RATES,
          value: SPECIAL_SNAPSHOT_REFS.SHOW_ALL_RATES,
          label: 'Show All Rates'
        },
        ...options
      ];
    }

    return options;
  }, [snapshotRefs, selectedParty]);

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
    snapshotItemsByRowKey: activeSnapshotMap,
    selectedSnapshotRef,
    signedInEmail,
    isAuthenticated: auth.isAuthenticated,
    isAdminUser,
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

  const clearCopyFeedback = useCallback(() => {
    setCopyFeedback({ type: '', message: '' });
  }, []);

  const snapshotActive = mode === APP_MODES.SNAPSHOT && Boolean(selectedSnapshotRef);
  const copyRatesData = useMemo(() => {
    return buildOwnerApprovedRatesCopyData({
      partyName: selectedParty,
      displayedProducts,
      activeSnapshotMap,
      latestHistoryByRowKey,
      snapshotActive,
      getRowKey: rateEditor.getRowKey
    });
  }, [
    selectedParty,
    displayedProducts,
    activeSnapshotMap,
    latestHistoryByRowKey,
    snapshotActive,
    rateEditor.getRowKey
  ]);

  const copyPartyRatesData = useMemo(() => {
    return buildCopyPartyRatesImageData({
      partyName: selectedParty,
      ownerRows: selectedRowsByType.ownerRows
    });
  }, [selectedParty, selectedRowsByType.ownerRows]);

  const exportRatesData = useMemo(() => {
    return buildOwnerApprovedExportRows({
      displayedProducts,
      activeSnapshotMap,
      getRowKey: rateEditor.getRowKey,
      settings,
      selectedParty
    });
  }, [displayedProducts, activeSnapshotMap, rateEditor.getRowKey, settings, selectedParty]);

  const handleCopyRates = useCallback(async () => {
    saveFlow.clearFeedback();
    clearCopyFeedback();

    if (!copyRatesData.canCopy || !copyRatesData.copyText) {
      setCopyFeedback({
        type: 'error',
        message: copyRatesData.reason || 'No owner-approved rates in the current view.'
      });
      return;
    }

    try {
      await copyPlainTextToClipboard(copyRatesData.copyText);
      setCopyFeedback({
        type: 'success',
        message: `Rates copied successfully (${toNumberOrZero(copyRatesData.itemCount)} item${copyRatesData.itemCount === 1 ? '' : 's'}).`
      });
    } catch (error) {
      setCopyFeedback({
        type: 'error',
        message: error?.message || 'Unable to copy rates. Please try again.'
      });
    }
  }, [copyRatesData, saveFlow.clearFeedback, clearCopyFeedback]);

  const handleCopyPartyRates = useCallback(async () => {
    saveFlow.clearFeedback();
    clearCopyFeedback();

    if (!isAdminUser) {
      setCopyFeedback({
        type: 'error',
        message: 'Copy Party Rates is available for ADMIN users only.'
      });
      return;
    }

    if (!copyPartyRatesData.canCopy) {
      setCopyFeedback({
        type: 'error',
        message: copyPartyRatesData.reason || 'No valid selected rows to generate party rates image.'
      });
      return;
    }

    try {
      const result = await copyPartyRatesImage(copyPartyRatesData);
      const copiedCount = toNumberOrZero(result?.itemCount || copyPartyRatesData.itemCount);
      if (result?.method === 'clipboard') {
        setCopyFeedback({
          type: 'success',
          message: `Party rates image copied (${copiedCount} item${copiedCount === 1 ? '' : 's'}).`
        });
        return;
      }

      setCopyFeedback({
        type: 'success',
        message: `Clipboard image copy not supported. Downloaded PNG fallback (${copiedCount} item${copiedCount === 1 ? '' : 's'}).`
      });
    } catch (error) {
      setCopyFeedback({
        type: 'error',
        message: error?.message || 'Unable to generate/copy party rates image.'
      });
    }
  }, [saveFlow.clearFeedback, clearCopyFeedback, isAdminUser, copyPartyRatesData]);

  const handleExportRates = useCallback(() => {
    saveFlow.clearFeedback();
    clearCopyFeedback();

    try {
      const fileName = exportOwnerApprovedRatesToXlsx(exportRatesData);
      setCopyFeedback({
        type: 'success',
        message: `Exported ${exportRatesData.itemCount} item${exportRatesData.itemCount === 1 ? '' : 's'} to ${fileName}.`
      });
    } catch (error) {
      setCopyFeedback({
        type: 'error',
        message: error?.message || 'Unable to export rates.'
      });
    }
  }, [exportRatesData, saveFlow.clearFeedback, clearCopyFeedback]);

  const rateBasisButtonLabel = rateBasis === RATE_BASIS.LATEST ? 'Show Old List' : 'Show Latest List';
  const rateBasisText = rateBasis === RATE_BASIS.LATEST ? 'Latest List Visible' : 'Old List Visible';
  const copyRatesBlockedByLoading = toolbarDisabled || productsLoading || snapshotLoading;
  const copyRatesDisabled = copyRatesBlockedByLoading || !copyRatesData.canCopy;
  const exportRatesDisabled = copyRatesBlockedByLoading;
  const copyRatesTooltip = !selectedParty
    ? 'Select a party to copy rates.'
    : copyRatesBlockedByLoading
      ? 'Copy is unavailable while the table is loading.'
      : copyRatesData.reason || 'Copy owner-approved rates from the current view.';
  const copyPartyRatesDisabled = !isAdminUser || copyRatesBlockedByLoading || !copyPartyRatesData.canCopy;
  const copyPartyRatesTooltip = !isAdminUser
    ? 'Available for ADMIN users only.'
    : !selectedParty
      ? 'Select a party to copy party rates.'
      : copyRatesBlockedByLoading
        ? 'Copy Party Rates is unavailable while the table is loading.'
        : copyPartyRatesData.reason || 'Copy selected owner rows as a WhatsApp-friendly image.';

  const activeToastFeedback = copyFeedback.message ? copyFeedback : saveFlow.feedback;
  const clearActiveToast = copyFeedback.message ? clearCopyFeedback : saveFlow.clearFeedback;

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
            <UserPanel
              authStatus={auth.status}
              user={auth.user}
              loading={auth.isLoading}
              isAuthenticated={auth.isAuthenticated}
              isUnavailable={auth.isUnavailable}
              error={auth.error}
              role={userRole.role}
              isAdminUser={isAdminUser}
              onSignIn={auth.signIn}
              onSignOut={auth.signOut}
              onRetry={auth.reload}
              setSignInHost={auth.setSignInHost}
              className="user-panel--corner"
            />
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

          <InlineError
            message={auth.isAuthenticated ? userRole.error : ''}
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
              <div className="toolbar toolbar--mode-only">
                <div className="toolbar__row toolbar__row--top">
                  <ModeToggle value={mode} onChange={setMode} disabled={toolbarDisabled} />
                </div>
              </div>
            )}

          </section>

          <ActionBar
            isAuthenticated={auth.isAuthenticated}
            isAdminUser={isAdminUser}
            savingType={saveFlow.savingType}
            disabled={toolbarDisabled || productsLoading || snapshotLoading || showAllRatesActive}
            onSaveOwner={handleOpenOwnerConfirm}
            onCopyRates={handleCopyRates}
            showCopyRates={snapshotActive}
            onExportRates={handleExportRates}
            showExportRates={snapshotActive}
            exportRatesDisabled={exportRatesDisabled}
            exportRatesTitle={snapshotActive ? 'Export owner-approved saved rates.' : 'Load saved references to export rates.'}
            copyRatesDisabled={copyRatesDisabled}
            copyRatesTitle={copyRatesTooltip}
            filtersNode={(
              <div className="action-bar__filters">
                <PartySelector
                  parties={parties}
                  value={selectedParty}
                  onChange={setSelectedParty}
                  loading={bootstrapLoading}
                  disabled={toolbarDisabled}
                />

                <SnapshotSelector
                  mode={mode}
                  value={selectedSnapshotRef}
                  onChange={setSelectedSnapshotRef}
                  options={snapshotOptions}
                  loading={historyLoading}
                  disabled={toolbarDisabled || !selectedParty}
                />

                <SearchBox
                  value={productSearch}
                  onChange={setProductSearch}
                  disabled={toolbarDisabled}
                />
              </div>
            )}
            auxiliaryNode={(
              <div className="rate-source-bar">
                <button
                  type="button"
                  className={`rate-basis-toggle ${rateBasis === RATE_BASIS.OLD ? 'rate-basis-toggle--old' : ''}`}
                  onClick={handleToggleRateBasis}
                  aria-pressed={rateBasis === RATE_BASIS.OLD}
                  title={rateBasisButtonLabel}
                >
                  <span>{rateBasisText}</span>
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
            canEditSnapshotConditions={isAdminUser}
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
        open={Boolean(activeToastFeedback.message)}
        type={activeToastFeedback.type === 'error' ? 'error' : 'success'}
        message={activeToastFeedback.message}
        onClose={clearActiveToast}
      />
    </div>
  );
}

export default App;

