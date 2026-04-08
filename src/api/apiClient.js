import { APP_CONFIG } from '../constants/appConfig';
import { joinUrl, toQueryString } from '../utils/helpers';

class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = details.status || 0;
    this.code = details.code || 'API_ERROR';
    this.errors = Array.isArray(details.errors) ? details.errors : [];
    this.payload = details.payload || null;
  }
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
}

function parseJsonSafe(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeApiEnvelope(payload, fallbackMessage) {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      message: fallbackMessage,
      data: null,
      errors: []
    };
  }

  return {
    ok: Boolean(payload.ok),
    message: payload.message || fallbackMessage,
    data: payload.data ?? null,
    errors: Array.isArray(payload.errors) ? payload.errors : []
  };
}

async function request(method, action, { query = {}, body, timeoutMs = APP_CONFIG.REQUEST_TIMEOUT_MS } = {}) {
  if (!APP_CONFIG.API_BASE) {
    throw new ApiError('Missing VITE_API_BASE. Configure environment variables.', {
      code: 'MISSING_API_BASE'
    });
  }

  const queryString = toQueryString({ action, ...query });
  const url = queryString
    ? `${APP_CONFIG.API_BASE}?${queryString}`
    : joinUrl(APP_CONFIG.API_BASE, '');

  const { controller, timeout } = withTimeout(timeoutMs);
  const isPost = method === 'POST';
  const headers = isPost
    // Keep Apps Script calls CORS-simple to avoid browser preflight OPTIONS.
    ? { 'Content-Type': 'text/plain;charset=utf-8' }
    : undefined;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: isPost ? JSON.stringify(body || {}) : undefined,
      signal: controller.signal
    });

    const rawText = await response.text();
    const parsed = parseJsonSafe(rawText);
    const envelope = normalizeApiEnvelope(
      parsed,
      response.ok ? 'Request completed.' : `Request failed with status ${response.status}.`
    );

    if (!response.ok || !envelope.ok) {
      throw new ApiError(envelope.message || 'Request failed.', {
        status: response.status,
        code: envelope.data?.code || 'API_REQUEST_FAILED',
        errors: envelope.errors,
        payload: envelope
      });
    }

    return envelope;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('Request timed out. Please retry.', {
        code: 'REQUEST_TIMEOUT'
      });
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(error?.message || 'Network request failed.', {
      code: 'NETWORK_ERROR'
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiGet(action, query = {}, options = {}) {
  return request('GET', action, {
    query,
    timeoutMs: options.timeoutMs
  });
}

export async function apiPost(action, body = {}, options = {}) {
  return request('POST', action, {
    body,
    timeoutMs: options.timeoutMs
  });
}

export const apiClient = {
  get: apiGet,
  post: apiPost
};

export { ApiError };
