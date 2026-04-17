import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/apiClient';
import { API_ACTIONS } from '../constants/appConfig';
import { buildErrorMessage } from '../utils/helpers';
import { isAdminUser, normalizeUserRole } from '../utils/userRole';

const DEFAULT_ROLE_STATE = Object.freeze({
  email: '',
  name: '',
  role: 'USER',
  active: false,
  found: false,
  isAdmin: false
});

function normalizeRolePayload(payload, fallbackEmail) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const role = normalizeUserRole(safe.role);
  const active = Boolean(safe.active);
  const found = Boolean(safe.found);
  return {
    email: String(safe.email || fallbackEmail || '').trim().toLowerCase(),
    name: String(safe.name || '').trim(),
    role,
    active,
    found,
    isAdmin: active && isAdminUser(role)
  };
}

export function useUserRole({ userEmail = '', enabled = true } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [roleState, setRoleState] = useState(DEFAULT_ROLE_STATE);

  const getCurrentUserRole = useCallback(async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      setRoleState(DEFAULT_ROLE_STATE);
      return DEFAULT_ROLE_STATE;
    }

    const response = await apiClient.get(API_ACTIONS.GET_CURRENT_USER_ROLE, {
      userEmail: normalizedEmail
    });
    const normalized = normalizeRolePayload(response?.data, normalizedEmail);
    setRoleState(normalized);
    return normalized;
  }, []);

  useEffect(() => {
    const normalizedEmail = String(userEmail || '').trim().toLowerCase();
    if (!enabled || !normalizedEmail) {
      setLoading(false);
      setError('');
      setRoleState(DEFAULT_ROLE_STATE);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError('');

    getCurrentUserRole(normalizedEmail)
      .catch((loadError) => {
        if (ignore) {
          return;
        }
        setRoleState({
          ...DEFAULT_ROLE_STATE,
          email: normalizedEmail
        });
        setError(buildErrorMessage(loadError, 'Unable to resolve user role.'));
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [enabled, userEmail, getCurrentUserRole]);

  return useMemo(() => {
    return {
      loading,
      error,
      ...roleState,
      getCurrentUserRole
    };
  }, [loading, error, roleState, getCurrentUserRole]);
}
