let __spreadsheetCache = null;

function createResponseEnvelope(ok, message, data, errors) {
  return {
    ok: Boolean(ok),
    message: message || '',
    data: data === undefined ? null : data,
    errors: Array.isArray(errors) ? errors : []
  };
}

function toJsonOutput(payload) {
  // Apps Script web apps always return TextOutput transport for JSON APIs.
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function respondOk(message, data) {
  return toJsonOutput(createResponseEnvelope(true, message, data, []));
}

function respondError(message, errors, data) {
  return toJsonOutput(createResponseEnvelope(false, message, data, errors));
}

function appError(code, message, errors) {
  const err = new Error(message || 'Application error.');
  err.name = 'AppError';
  err.code = code || 'APP_ERROR';
  err.errors = Array.isArray(errors) ? errors : [];
  return err;
}

function normalizeError(err) {
  if (err && err.name === 'AppError') {
    return {
      code: err.code || 'APP_ERROR',
      message: err.message || 'Application error.',
      errors: Array.isArray(err.errors) ? err.errors : []
    };
  }

  const errors = [];
  if (err && err.message) {
    errors.push({ detail: String(err.message) });
  }
  if (CONFIG.DEFAULTS.DEBUG_ERRORS && err && err.stack) {
    errors.push({ detail: String(err.stack) });
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error.',
    errors: errors
  };
}

function parseQueryParams(e) {
  const result = {};
  const params = (e && e.parameter) ? e.parameter : {};
  const keys = Object.keys(params);

  for (let i = 0; i < keys.length; i += 1) {
    const rawKey = keys[i];
    const normalized = normalizeKey(rawKey);
    result[normalized] = normalizeString(params[rawKey]);
  }

  return result;
}

function parseJsonBody(e) {
  if (!e || !e.postData || isBlank(e.postData.contents)) {
    return {};
  }

  try {
    // Strictly accept object payloads so request contracts stay predictable.
    const parsed = JSON.parse(e.postData.contents);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw appError('INVALID_JSON_BODY', 'JSON body must be an object.', [
        { field: 'body', detail: 'Expected a top-level JSON object.' }
      ]);
    }
    return parsed;
  } catch (err) {
    if (err && err.name === 'AppError') {
      throw err;
    }
    throw appError('INVALID_JSON_BODY', 'Invalid JSON in request body.', [
      { field: 'body', detail: err && err.message ? err.message : 'Malformed JSON.' }
    ]);
  }
}

function buildRequestContext(method, e) {
  const query = parseQueryParams(e);
  const body = method === 'POST' ? parseJsonBody(e) : {};
  const action = normalizeKey(firstNonBlank_([
    query.action,
    readObjectValueByNormalizedKey_(body, 'action')
  ]));

  return {
    method: method,
    action: action,
    query: query,
    body: body,
    requestId: makeRefKey('req'),
    receivedAt: nowIso(),
    rawEvent: e || {}
  };
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function toSafeNumber(value, fallback) {
  const safeFallback = fallback === undefined ? null : fallback;
  if (isBlank(value)) {
    return safeFallback;
  }

  const n = Number(value);
  if (Number.isNaN(n)) {
    return safeFallback;
  }
  return n;
}

function toSafeDate(value, fallback) {
  const safeFallback = fallback === undefined ? null : fallback;
  if (isBlank(value)) {
    return safeFallback;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return safeFallback;
  }
  return d;
}

function round2(value) {
  const n = toSafeNumber(value, 0);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function getSpreadsheet() {
  if (__spreadsheetCache) {
    return __spreadsheetCache;
  }

  if (isBlank(CONFIG.SPREADSHEET_ID) || CONFIG.SPREADSHEET_ID === CONFIG.PLACEHOLDER_SPREADSHEET_ID) {
    throw appError('SPREADSHEET_ID_NOT_CONFIGURED', 'Spreadsheet ID is not configured.', [
      { field: 'SPREADSHEET_ID', detail: 'Set CONFIG.SPREADSHEET_ID to a valid spreadsheet ID.' }
    ]);
  }

  try {
    __spreadsheetCache = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    return __spreadsheetCache;
  } catch (err) {
    throw appError('SPREADSHEET_CONNECTION_FAILED', 'Unable to open spreadsheet.', [
      { field: 'SPREADSHEET_ID', detail: err && err.message ? err.message : 'Unknown error.' }
    ]);
  }
}

function getSheetOrThrow(name, spreadsheet) {
  if (isBlank(name)) {
    throw appError('SHEET_NAME_REQUIRED', 'Sheet name is required.');
  }

  const ss = spreadsheet || getSpreadsheet();
  const sheet = ss.getSheetByName(String(name));
  if (!sheet) {
    throw appError('SHEET_NOT_FOUND', 'Required sheet not found.', [
      { field: 'sheet', detail: String(name) }
    ]);
  }
  return sheet;
}

function getAllValues(sheet) {
  if (!sheet) {
    throw appError('SHEET_REQUIRED', 'Sheet object is required.');
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 0 || lastCol <= 0) {
    return [];
  }
  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function normalizeKey(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function makeRefKey(prefix) {
  const safePrefix = isBlank(prefix) ? 'ref' : normalizeKey(prefix);
  return safePrefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function nowIso() {
  return new Date().toISOString();
}

function firstNonBlank_(values) {
  for (let i = 0; i < values.length; i += 1) {
    if (!isBlank(values[i])) {
      return values[i];
    }
  }
  return '';
}

function readObjectValueByNormalizedKey_(obj, targetKey) {
  if (!obj || typeof obj !== 'object') {
    return '';
  }
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (normalizeKey(key) === normalizeKey(targetKey)) {
      return obj[key];
    }
  }
  return '';
}
