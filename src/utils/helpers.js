export function toQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });

  return searchParams.toString();
}

export function joinUrl(base, path = '') {
  const safeBase = String(base || '').trim();
  const safePath = String(path || '').trim();

  if (!safeBase) {
    return safePath;
  }

  if (!safePath) {
    return safeBase;
  }

  if (safeBase.endsWith('/') && safePath.startsWith('/')) {
    return safeBase + safePath.slice(1);
  }

  if (!safeBase.endsWith('/') && !safePath.startsWith('/')) {
    return `${safeBase}/${safePath}`;
  }

  return safeBase + safePath;
}

export function buildErrorMessage(error, fallback = 'Something went wrong.') {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error?.message) {
    return String(error.message);
  }

  return fallback;
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}