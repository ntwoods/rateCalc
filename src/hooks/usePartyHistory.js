import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/apiClient';
import { API_ACTIONS, SPECIAL_SNAPSHOT_REFS } from '../constants/appConfig';
import { buildErrorMessage } from '../utils/helpers';
import { toNumberOrZero } from '../utils/formatters';
import { makeAllRatesRowKey, makeRowKey, normalizeToken } from '../utils/keys';

function readAny(obj, keys, fallback = '') {
  if (!obj || typeof obj !== 'object') {
    return fallback;
  }

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }

  const normalizedMap = {};
  Object.keys(obj).forEach((key) => {
    normalizedMap[normalizeToken(key)] = obj[key];
  });

  for (let i = 0; i < keys.length; i += 1) {
    const normalizedKey = normalizeToken(keys[i]);
    if (Object.prototype.hasOwnProperty.call(normalizedMap, normalizedKey)) {
      return normalizedMap[normalizedKey];
    }
  }

  return fallback;
}

function normalizeActionTag(tag) {
  return String(tag || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function toEpoch(value) {
  if (!value) {
    return -1;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? -1 : date.getTime();
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  const text = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(text);
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeHistoryItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') {
    return null;
  }

  const category = String(readAny(rawItem, ['Category', 'category'])).trim();
  const product = String(readAny(rawItem, ['Product', 'product'])).trim();

  if (!category || !product) {
    return null;
  }

  const rowKey = makeRowKey(category, product);

  return {
    rowKey,
    category,
    product,
    lastRefKey: String(readAny(rawItem, ['LastRefKey', 'lastRefKey'])).trim(),
    lastActionTag: normalizeActionTag(readAny(rawItem, ['LastActionTag', 'lastActionTag'])),
    lastTimestamp: String(readAny(rawItem, ['LastTimestamp', 'lastTimestamp'])).trim(),
    lastUserEmail: String(readAny(rawItem, ['LastUserEmail', 'lastUserEmail'])).trim(),
    lastFinalRate: toNumberOrZero(readAny(rawItem, ['LastFinalRate', 'lastFinalRate'])),
    lastSpecialDiscPct: toNumberOrZero(readAny(rawItem, ['LastSpecialDiscPct', 'lastSpecialDiscPct'])),
    lastGSTMode: String(readAny(rawItem, ['LastGSTMode', 'lastGSTMode'])).trim(),
    lastFreightMode: String(readAny(rawItem, ['LastFreightMode', 'lastFreightMode'])).trim(),
    lastCDMode: String(readAny(rawItem, ['LastCDMode', 'lastCDMode'])).trim(),
    lastCDPercent: toNumberOrZero(readAny(rawItem, ['LastCDPercent', 'lastCDPercent'])),
    lastLatestListPrice: toNumberOrZero(readAny(rawItem, ['LastLatestListPrice', 'lastLatestListPrice'])),
    lastLatestWEF: String(readAny(rawItem, ['LastLatestWEF', 'lastLatestWEF'])).trim()
  };
}

function normalizeSnapshotRef(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') {
    return null;
  }

  const refKey = String(readAny(rawItem, ['refKey', 'RefKey'])).trim();
  if (!refKey) {
    return null;
  }

  const snapshotDateTime = String(readAny(rawItem, ['snapshotDateTime', 'SnapshotDateTime'])).trim();

  return {
    refKey,
    snapshotDateTime,
    actionTag: normalizeActionTag(readAny(rawItem, ['actionTag', 'ActionTag'])),
    itemCount: toNumberOrZero(readAny(rawItem, ['itemCount', 'ItemCount'])),
    userEmail: String(readAny(rawItem, ['userEmail', 'UserEmail'])).trim(),
    _epoch: toEpoch(snapshotDateTime)
  };
}

function normalizeSnapshotItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') {
    return null;
  }

  const category = String(readAny(rawItem, ['Category', 'category'])).trim();
  const product = String(readAny(rawItem, ['Product', 'product'])).trim();
  if (!category || !product) {
    return null;
  }

  const rowKey = makeRowKey(category, product);
  const partyName = String(readAny(rawItem, ['PartyName', 'partyName'])).trim();
  const isAllRatesItem = Boolean(readAny(rawItem, ['_showAllRates']));
  const effectiveRowKey = isAllRatesItem && partyName
    ? makeAllRatesRowKey(partyName, category, product)
    : rowKey;

  return {
    rowKey: effectiveRowKey,
    baseRowKey: rowKey,
    partyName,
    category,
    product,
    actionTag: normalizeActionTag(readAny(rawItem, ['ActionTag', 'actionTag'])),
    snapshotDateTime: String(readAny(rawItem, ['SnapshotDateTime', 'snapshotDateTime'])).trim(),
    paymentTerms: toNumberOrZero(readAny(rawItem, ['PaymentTerms', 'paymentTerms'])),
    latestListPrice: toNumberOrZero(readAny(rawItem, ['LatestListPrice', 'latestListPrice'])),
    latestWEF: String(readAny(rawItem, ['LatestWEF', 'latestWEF'])).trim(),
    previousListPrice: (() => {
      const rawPrev = readAny(rawItem, ['PreviousListPrice', 'previousListPrice'], null);
      if (rawPrev === null || rawPrev === undefined || rawPrev === '') {
        return null;
      }
      return toNumberOrZero(rawPrev);
    })(),
    previousWEF: String(readAny(rawItem, ['PreviousWEF', 'previousWEF'])).trim(),
    specialDiscPct: toNumberOrZero(readAny(rawItem, ['SpecialDiscPct', 'specialDiscPct'])),
    gstMode: String(readAny(rawItem, ['GSTMode', 'gstMode'])).trim().toUpperCase(),
    freightMode: String(readAny(rawItem, ['FreightMode', 'freightMode'])).trim().toUpperCase(),
    cdMode: String(readAny(rawItem, ['CDMode', 'cdMode'])).trim().toUpperCase(),
    cdPercent: toNumberOrZero(readAny(rawItem, ['CDPercent', 'cdPercent'])),
    afterSpecialDiscRate: toOptionalNumber(readAny(rawItem, ['AfterSpecialDiscRate', 'afterSpecialDiscRate'], null)),
    finalRate: toNumberOrZero(readAny(rawItem, ['FinalRate', 'finalRate'])),
    netRates: toOptionalNumber(readAny(rawItem, ['NetRates', 'netRates'], null)),
    ownerChecked: toBoolean(readAny(rawItem, ['OwnerChecked', 'ownerChecked'])),
    finalActionChecked: toBoolean(readAny(rawItem, ['FinalActionChecked', 'finalActionChecked']))
  };
}

export function usePartyHistory({ selectedParty = '', selectedSnapshotRef = '' } = {}) {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [latestHistoryItems, setLatestHistoryItems] = useState([]);
  const [snapshotRefs, setSnapshotRefs] = useState([]);

  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState('');
  const [snapshotHeader, setSnapshotHeader] = useState(null);
  const [snapshotItems, setSnapshotItems] = useState([]);

  const loadPartyHistory = useCallback(async () => {
    const partyName = String(selectedParty || '').trim();

    if (!partyName) {
      setHistoryLoading(false);
      setHistoryError('');
      setLatestHistoryItems([]);
      setSnapshotRefs([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError('');
    setLatestHistoryItems([]);
    setSnapshotRefs([]);

    try {
      const [historyResult, refsResult] = await Promise.allSettled([
        apiClient.get(API_ACTIONS.GET_PARTY_LATEST_HISTORY, { partyName }),
        apiClient.get(API_ACTIONS.GET_PARTY_SNAPSHOTS, { partyName })
      ]);

      let nextHistory = [];
      let nextRefs = [];
      const errors = [];

      if (historyResult.status === 'fulfilled') {
        const rawItems = historyResult.value?.data?.items || [];
        nextHistory = rawItems.map(normalizeHistoryItem).filter(Boolean);
      } else {
        errors.push(buildErrorMessage(historyResult.reason, 'Failed to load latest history.'));
      }

      if (refsResult.status === 'fulfilled') {
        const rawRefs = refsResult.value?.data?.snapshots || [];
        nextRefs = rawRefs
          .map(normalizeSnapshotRef)
          .filter(Boolean)
          .sort((a, b) => {
            if (b._epoch !== a._epoch) {
              return b._epoch - a._epoch;
            }
            return b.refKey.localeCompare(a.refKey);
          })
          .map((item) => ({
            refKey: item.refKey,
            snapshotDateTime: item.snapshotDateTime,
            actionTag: item.actionTag,
            itemCount: item.itemCount,
            userEmail: item.userEmail
          }));
      } else {
        errors.push(buildErrorMessage(refsResult.reason, 'Failed to load saved snapshots.'));
      }

      setLatestHistoryItems(nextHistory);
      setSnapshotRefs(nextRefs);
      setHistoryError(errors.join(' ').trim());
    } catch (error) {
      setLatestHistoryItems([]);
      setSnapshotRefs([]);
      setHistoryError(buildErrorMessage(error, 'Unable to load party history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedParty]);

  const loadSnapshotByRef = useCallback(async () => {
    const refKey = String(selectedSnapshotRef || '').trim();

    if (!refKey) {
      setSnapshotLoading(false);
      setSnapshotError('');
      setSnapshotHeader(null);
      setSnapshotItems([]);
      return;
    }

    setSnapshotLoading(true);
    setSnapshotError('');

    try {
      const isShowAllRates = refKey === SPECIAL_SNAPSHOT_REFS.SHOW_ALL_RATES;
      const result = isShowAllRates
        ? await apiClient.get(API_ACTIONS.GET_ALL_LATEST_RATES)
        : await apiClient.get(API_ACTIONS.GET_SNAPSHOT_BY_REF, { refKey });
      const payload = result?.data || {};

      const normalizedHeader = payload.header && typeof payload.header === 'object'
        ? {
            refKey,
            partyName: String(readAny(payload.header, ['PartyName', 'partyName'])).trim(),
            actionTag: normalizeActionTag(readAny(payload.header, ['ActionTag', 'actionTag'])),
            snapshotDateTime: String(readAny(payload.header, ['SnapshotDateTime', 'snapshotDateTime'])).trim(),
            userEmail: String(readAny(payload.header, ['UserEmail', 'userEmail'])).trim(),
            itemCount: toNumberOrZero(readAny(payload.header, ['ItemCount', 'itemCount']))
          }
        : null;

      const normalizedItems = Array.isArray(payload.items)
        ? payload.items
            .map((item) => (isShowAllRates ? { ...item, _showAllRates: true } : item))
            .map(normalizeSnapshotItem)
            .filter(Boolean)
        : [];

      setSnapshotHeader(normalizedHeader);
      setSnapshotItems(normalizedItems);
    } catch (error) {
      setSnapshotHeader(null);
      setSnapshotItems([]);
      setSnapshotError(buildErrorMessage(error, 'Unable to load selected snapshot.'));
    } finally {
      setSnapshotLoading(false);
    }
  }, [selectedSnapshotRef]);

  useEffect(() => {
    loadPartyHistory();
  }, [loadPartyHistory]);

  useEffect(() => {
    loadSnapshotByRef();
  }, [loadSnapshotByRef]);

  const latestHistoryByRowKey = useMemo(() => {
    const map = {};
    latestHistoryItems.forEach((item) => {
      map[item.rowKey] = item;
    });
    return map;
  }, [latestHistoryItems]);

  const snapshotItemsByRowKey = useMemo(() => {
    const map = {};
    snapshotItems.forEach((item) => {
      map[item.rowKey] = item;
    });
    return map;
  }, [snapshotItems]);

  return {
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

    reloadHistory: loadPartyHistory,
    reloadSnapshot: loadSnapshotByRef,

    makeRowKey,
    normalizeActionTag
  };
}
