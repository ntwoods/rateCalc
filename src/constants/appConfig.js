function normalizeBasePath(basePath) {
  const value = String(basePath || '/').trim();
  if (!value) {
    return '/';
  }

  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export const APP_CONFIG = Object.freeze({
  APP_NAME: 'Party Rate Discussion Portal',
  APP_VERSION: 'phase-2h',
  API_BASE: (import.meta.env.VITE_API_BASE || '').trim(),
  GOOGLE_CLIENT_ID: (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim(),
  BASE_PATH: normalizeBasePath(import.meta.env.VITE_BASE || '/'),
  REQUEST_TIMEOUT_MS: 20000
});

export const API_ACTIONS = Object.freeze({
  HEALTH: 'health',
  BOOTSTRAP: 'bootstrap',
  GET_PARTIES: 'getParties',
  GET_PRODUCTS: 'getProducts',
  GET_PARTY_SNAPSHOTS: 'getPartySnapshots',
  GET_SNAPSHOT_BY_REF: 'getSnapshotByRef',
  GET_PARTY_LATEST_HISTORY: 'getPartyLatestHistory',
  REBUILD_INDEXES: 'rebuildIndexes',
  SETUP_WORKBOOK: 'setupWorkbook',
  GET_SETTINGS: 'getSettings',
  GET_WORKBOOK_META: 'getWorkbookMeta',
  DEBUG_CALC: 'debugCalc',
  SAVE_OWNER_APPROVAL: 'saveOwnerApproval',
  SAVE_FINAL_ACTION: 'saveFinalAction'
});

export const BACKEND_STATUS = Object.freeze({
  LOADING: 'loading',
  CONNECTED: 'connected',
  FAILED: 'failed'
});

export const APP_MODES = Object.freeze({
  FRESH: 'FRESH',
  SNAPSHOT: 'SNAPSHOT'
});

export const SNAPSHOT_VIEW_MODES = Object.freeze({
  OVERLAY: 'OVERLAY',
  SNAPSHOT_ONLY: 'SNAPSHOT_ONLY'
});

export const RATE_BASIS = Object.freeze({
  LATEST: 'LATEST',
  OLD: 'OLD'
});

export const AUTH_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  SIGNED_IN: 'signed_in',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error'
});

export const FINAL_ACTION_TAGS = Object.freeze({
  PARTY_AGREED: 'PARTY_AGREED',
  DISPATCHED: 'DISPATCHED'
});

export const GST_MODES = Object.freeze({
  PAID: 'PAID',
  EXTRA: 'EXTRA'
});

export const FREIGHT_MODES = Object.freeze({
  EXTRA: 'EXTRA',
  FOR: 'FOR',
  HALF_HALF: 'HALF_HALF'
});

export const CD_MODES = Object.freeze({
  NET_RATES: 'NET_RATES',
  PERCENT: 'PERCENT'
});
