import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/apiClient';
import { API_ACTIONS, BACKEND_STATUS } from '../constants/appConfig';
import { buildErrorMessage } from '../utils/helpers';

export function useBackendBootstrap(options = {}) {
  const includeBootstrap = Boolean(options.includeBootstrap);
  const [status, setStatus] = useState(BACKEND_STATUS.LOADING);
  const [health, setHealth] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [error, setError] = useState('');

  const runStartupChecks = useCallback(async () => {
    setStatus(BACKEND_STATUS.LOADING);
    setError('');

    try {
      const healthResponse = await apiClient.get(API_ACTIONS.HEALTH);
      setHealth(healthResponse.data);

      if (includeBootstrap) {
        try {
          const bootstrapResponse = await apiClient.get(API_ACTIONS.BOOTSTRAP);
          setBootstrap(bootstrapResponse.data);
        } catch (bootstrapError) {
          setBootstrap(null);
          setError(buildErrorMessage(bootstrapError, 'Connected, but bootstrap failed.'));
        }
      } else {
        setBootstrap(null);
      }

      setStatus(BACKEND_STATUS.CONNECTED);
    } catch (healthError) {
      setStatus(BACKEND_STATUS.FAILED);
      setHealth(null);
      setBootstrap(null);
      setError(buildErrorMessage(healthError, 'Backend connection failed.'));
    }
  }, [includeBootstrap]);

  useEffect(() => {
    runStartupChecks();
  }, [runStartupChecks]);

  const metadata = useMemo(() => {
    return {
      app: health?.app || '',
      backendVersion: health?.version || bootstrap?.version || '',
      timestamp: health?.timestamp || ''
    };
  }, [health, bootstrap]);

  return {
    status,
    error,
    health,
    bootstrap,
    metadata,
    retry: runStartupChecks
  };
}
