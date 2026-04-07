import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/apiClient';
import { API_ACTIONS } from '../constants/appConfig';
import { buildErrorMessage } from '../utils/helpers';

function normalizeSettings(rawSettings) {
  if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    return {};
  }

  const normalized = {};
  Object.keys(rawSettings).forEach((key) => {
    const safeKey = String(key || '').trim();
    if (!safeKey) {
      return;
    }
    normalized[safeKey] = rawSettings[key];
  });

  return normalized;
}

function normalizeParty(rawParty) {
  if (!rawParty) {
    return null;
  }

  if (typeof rawParty === 'string') {
    const partyName = rawParty.trim();
    return partyName ? { partyName, active: true, sortOrder: 999999, notes: '' } : null;
  }

  if (typeof rawParty !== 'object') {
    return null;
  }

  const partyName = String(
    rawParty.partyName ?? rawParty.PartyName ?? rawParty.name ?? rawParty.Name ?? ''
  ).trim();

  if (!partyName) {
    return null;
  }

  const activeRaw = rawParty.active ?? rawParty.Active ?? true;
  const isActive = Boolean(
    typeof activeRaw === 'string'
      ? ['true', '1', 'yes', 'y'].includes(activeRaw.toLowerCase())
      : activeRaw
  );

  const sortOrderRaw = rawParty.sortOrder ?? rawParty.SortOrder ?? 999999;
  const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 999999;

  return {
    partyName,
    active: isActive,
    sortOrder,
    notes: String(rawParty.notes ?? rawParty.Notes ?? '').trim()
  };
}

function normalizeParties(rawParties) {
  const source = Array.isArray(rawParties)
    ? rawParties
    : Array.isArray(rawParties?.parties)
      ? rawParties.parties
      : [];

  const map = new Map();

  source.forEach((item) => {
    const normalized = normalizeParty(item);
    if (!normalized || !normalized.active) {
      return;
    }

    const key = normalized.partyName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, normalized);
      return;
    }

    const existing = map.get(key);
    if ((normalized.sortOrder ?? 999999) < (existing.sortOrder ?? 999999)) {
      map.set(key, normalized);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.partyName.localeCompare(b.partyName);
  });
}

export function useBootstrap() {
  const [settings, setSettings] = useState({});
  const [parties, setParties] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [bootstrapResult, partiesResult] = await Promise.allSettled([
        apiClient.get(API_ACTIONS.BOOTSTRAP),
        apiClient.get(API_ACTIONS.GET_PARTIES)
      ]);

      const bootstrapData =
        bootstrapResult.status === 'fulfilled' && bootstrapResult.value?.data
          ? bootstrapResult.value.data
          : {};

      const settingsMap = normalizeSettings(bootstrapData.settings || {});

      const partiesFromBootstrap = normalizeParties(bootstrapData.parties || []);

      const partiesFromPartiesApi =
        partiesResult.status === 'fulfilled'
          ? normalizeParties(partiesResult.value?.data?.parties || partiesResult.value?.data || [])
          : [];

      const resolvedParties = partiesFromPartiesApi.length > 0 ? partiesFromPartiesApi : partiesFromBootstrap;

      if (bootstrapResult.status === 'rejected' && partiesResult.status === 'rejected') {
        throw bootstrapResult.reason || partiesResult.reason;
      }

      if (bootstrapResult.status === 'rejected' && partiesResult.status === 'fulfilled') {
        setError('Bootstrap partially loaded. Using getParties fallback for party list.');
      }

      setSettings(settingsMap);
      setParties(resolvedParties);
      setMetadata(
        bootstrapData.metadata && typeof bootstrapData.metadata === 'object'
          ? bootstrapData.metadata
          : {}
      );
    } catch (loadError) {
      setSettings({});
      setParties([]);
      setMetadata({});
      setError(buildErrorMessage(loadError, 'Unable to load bootstrap data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const hasData = useMemo(() => {
    return parties.length > 0 || Object.keys(settings).length > 0;
  }, [parties, settings]);

  return {
    settings,
    parties,
    metadata,
    loading,
    error,
    hasData,
    reload: loadBootstrap
  };
}