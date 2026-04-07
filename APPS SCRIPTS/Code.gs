function doGet(e) {
  return handleRequest_('GET', e);
}

function doPost(e) {
  return handleRequest_('POST', e);
}

function handleRequest_(method, e) {
  try {
    return routeRequest(method, e);
  } catch (err) {
    LogService.error('unhandled_request_error', err, { method: method });
    const normalized = normalizeError(err);
    return respondError(normalized.message, normalized.errors, { code: normalized.code });
  }
}
