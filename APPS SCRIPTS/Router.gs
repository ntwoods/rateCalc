function routeRequest(method, e) {
  try {
    const ctx = buildRequestContext(method, e);

    if (isBlank(ctx.action)) {
      throw appError('ACTION_REQUIRED', 'Missing action parameter.', [
        { field: 'action', detail: 'Provide action in query string or JSON body.' }
      ]);
    }

    validateActionMethod_(ctx);

    switch (ctx.action) {
      case normalizeKey(CONFIG.ACTIONS.HEALTH):
        return handleHealthRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.SETUP_WORKBOOK):
        return handleSetupWorkbookRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.BOOTSTRAP):
        return handleBootstrapRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.GET_PARTIES):
        return handleGetPartiesRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.GET_PRODUCTS):
        return handleGetProductsRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.GET_CURRENT_USER_ROLE):
        return handleGetCurrentUserRoleRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.GET_PARTY_SNAPSHOTS):
        return handleGetPartySnapshotsRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.GET_SNAPSHOT_BY_REF):
        return handleGetSnapshotByRefRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.GET_PARTY_LATEST_HISTORY):
        return handleGetPartyLatestHistoryRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.REBUILD_INDEXES):
        return handleRebuildIndexesRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.GET_SETTINGS):
        return handleGetSettingsRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.GET_WORKBOOK_META):
        return handleGetWorkbookMetaRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.DEBUG_CALC):
        return handleDebugCalcRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.SAVE_OWNER_APPROVAL):
        return handleSaveOwnerApprovalRoute_(ctx);
      case normalizeKey(CONFIG.ACTIONS.SAVE_FINAL_ACTION):
        return handleSaveFinalActionRoute_(ctx);
      default:
        throw appError('ACTION_UNSUPPORTED', 'Unsupported action.', [
          { field: 'action', detail: 'Supported actions: ' + CONFIG.SUPPORTED_ACTIONS.join(', ') }
        ]);
    }
  } catch (err) {
    LogService.error('route_request_failed', err, {
      method: method,
      action: (e && e.parameter && e.parameter.action) ? e.parameter.action : ''
    });
    const normalized = normalizeError(err);
    return respondError(normalized.message, normalized.errors, { code: normalized.code });
  }
}

function handleHealthRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.HEALTH);
  const report = MasterService.getHealthReport();
  return respondOk('Health check completed.', report);
}

function handleSetupWorkbookRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.SETUP_WORKBOOK);
  const result = SetupService.setupWorkbook();
  return respondOk('Workbook setup completed.', result);
}

function handleBootstrapRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.BOOTSTRAP);
  const data = MasterService.getBootstrapData();
  return respondOk('Bootstrap data fetched.', data);
}

function handleGetPartiesRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.GET_PARTIES);
  const parties = MasterService.getActiveParties();
  return respondOk('Active parties fetched.', {
    parties: parties,
    count: parties.length
  });
}

function handleGetProductsRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.GET_PRODUCTS);
  const data = MasterService.getProductMaster({
    search: ctx.query.search,
    category: ctx.query.category
  });
  return respondOk('Product master fetched.', data);
}

function handleGetCurrentUserRoleRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.GET_CURRENT_USER_ROLE);
  const userEmail = readParam_(ctx, ['useremail', 'user_email', 'email']);
  const data = MasterService.getCurrentUserRole(userEmail);
  return respondOk('User role fetched.', data);
}

function handleGetPartySnapshotsRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.GET_PARTY_SNAPSHOTS);
  const data = LogService.getPartySnapshots(readParam_(ctx, ['partyname', 'party_name', 'party']));
  return respondOk('Party snapshots fetched.', data);
}

function handleGetSnapshotByRefRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.GET_SNAPSHOT_BY_REF);
  const data = LogService.getSnapshotByRef(readParam_(ctx, ['refkey', 'ref_key', 'ref']));
  return respondOk('Snapshot fetched.', data);
}

function handleGetPartyLatestHistoryRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.GET_PARTY_LATEST_HISTORY);
  const data = LogService.getPartyLatestHistory(readParam_(ctx, ['partyname', 'party_name', 'party']));
  return respondOk('Party latest history fetched.', data);
}

function handleRebuildIndexesRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.REBUILD_INDEXES);
  const data = LogService.rebuildPartyItemLatestIndex();
  return respondOk('Indexes rebuilt.', data);
}

function handleGetSettingsRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.GET_SETTINGS);
  const settings = MasterService.getSettingsMap();
  return respondOk('Settings fetched.', {
    settings: settings,
    count: Object.keys(settings).length
  });
}

function handleGetWorkbookMetaRoute_(ctx) {
  requireMethod_(ctx, 'GET', CONFIG.ACTIONS.GET_WORKBOOK_META);
  const meta = MasterService.getWorkbookMeta();
  return respondOk('Workbook metadata fetched.', meta);
}

function handleDebugCalcRoute_(ctx) {
  requireMethod_(ctx, 'POST', CONFIG.ACTIONS.DEBUG_CALC);

  const payload = ctx.body || {};
  const item = payload.item && typeof payload.item === 'object' ? payload.item : payload;
  const providedSettings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};

  let baseSettings = {};
  try {
    baseSettings = MasterService.getSettingsMap();
  } catch (err) {
    baseSettings = {};
  }

  const effectiveSettings = Object.assign({}, baseSettings, providedSettings);
  const result = CalcService.calculateItemRate(item, effectiveSettings);

  return respondOk('debugCalc completed.', {
    input: item,
    settings: effectiveSettings,
    breakdown: result
  });
}

function handleSaveOwnerApprovalRoute_(ctx) {
  requireMethod_(ctx, 'POST', CONFIG.ACTIONS.SAVE_OWNER_APPROVAL);
  const result = LogService.saveRateBatch(ctx.body || {}, CONFIG.ACTION_TAGS.OWNER_APPROVED);
  return respondOk('Owner approval saved.', result);
}

function handleSaveFinalActionRoute_(ctx) {
  requireMethod_(ctx, 'POST', CONFIG.ACTIONS.SAVE_FINAL_ACTION);

  const payload = ctx.body || {};
  const actionTag = normalizeString(payload.actionTag)
    .toUpperCase()
    .replace(/[\s\-]+/g, '_');

  if (CONFIG.FINAL_ACTION_TAGS.indexOf(actionTag) < 0) {
    throw appError('INVALID_FINAL_ACTION_TAG', 'Final action tag must be PARTY_AGREED or DISPATCHED.', [
      { field: 'actionTag', detail: 'Allowed values: ' + CONFIG.FINAL_ACTION_TAGS.join(', ') }
    ]);
  }

  const result = LogService.saveRateBatch(payload, actionTag);
  return respondOk('Final action saved.', result);
}

function requireMethod_(ctx, expectedMethod, actionName) {
  if (ctx.method !== expectedMethod) {
    throw appError('METHOD_NOT_ALLOWED', actionName + ' endpoint only supports ' + expectedMethod + '.', [
      { field: 'method', detail: 'Use ' + expectedMethod + ' with action=' + actionName + '.' }
    ]);
  }
}

function validateActionMethod_(ctx) {
  const actionByMethod = ctx.method === 'GET'
    ? CONFIG.ROUTE_METHODS.GET
    : ctx.method === 'POST'
      ? CONFIG.ROUTE_METHODS.POST
      : [];

  const normalizedAllowed = actionByMethod.map(function (action) {
    return normalizeKey(action);
  });

  if (normalizedAllowed.indexOf(ctx.action) < 0) {
    throw appError('ACTION_METHOD_NOT_ALLOWED', 'Action is not supported for request method.', [
      { field: 'method', detail: 'Method: ' + ctx.method },
      { field: 'action', detail: 'Allowed ' + ctx.method + ' actions: ' + actionByMethod.join(', ') }
    ]);
  }
}

function readParam_(ctx, keys) {
  const query = (ctx && ctx.query) ? ctx.query : {};
  for (let i = 0; i < keys.length; i += 1) {
    const key = normalizeKey(keys[i]);
    if (!isBlank(query[key])) {
      return query[key];
    }
  }
  return '';
}
