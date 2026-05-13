var LogService = (function () {
  // Central audit and historical data service (immutable logs + latest index).
  function info(eventName, payload) {
    Logger.log(JSON.stringify({
      level: 'INFO',
      event: normalizeString(eventName),
      timestamp: nowIso(),
      payload: payload || null
    }));
  }

  function error(eventName, err, payload) {
    Logger.log(JSON.stringify({
      level: 'ERROR',
      event: normalizeString(eventName),
      timestamp: nowIso(),
      message: err && err.message ? String(err.message) : 'Unknown error',
      stack: err && err.stack ? String(err.stack) : '',
      payload: payload || null
    }));
  }

  function appendApiLogRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return 0;
    }

    const sheet = getSheetOrThrow(CONFIG.SHEETS.API_LOG);
    const width = rows[0].length;
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, width).setValues(rows);
    return rows.length;
  }

  // Save flow:
  // 1) Validate payload and selected rows.
  // 2) Recompute all rates server-side.
  // 3) Either append a new immutable ref OR update a loaded ref in-place (admin-only).
  // 4) Upsert PartyItemLatest index for fast history reads.
  function saveRateBatch(payload, actionTag) {
    const rawPayload = payload && typeof payload === 'object' ? payload : {};
    const resolvedActionTag = normalizeActionTag_(actionTag);
    validateActionTag_(resolvedActionTag);

    const partyNameInput = normalizeString(rawPayload.partyName);
    const partyName = ensureActiveParty_(partyNameInput);

    const userEmail = normalizeString(rawPayload.userEmail).toLowerCase();
    if (isBlank(userEmail)) {
      throw appError('USER_EMAIL_REQUIRED', 'userEmail is required.', [
        { field: 'userEmail', detail: 'Provide a valid email for audit log.' }
      ]);
    }
    if (!isValidEmail_(userEmail)) {
      throw appError('USER_EMAIL_INVALID', 'userEmail format is invalid.', [
        { field: 'userEmail', detail: userEmail }
      ]);
    }

    const sourceMode = normalizeSourceMode_(rawPayload.sourceMode);
    if (CONFIG.ALLOWED_SOURCE_MODES.indexOf(sourceMode) < 0) {
      throw appError('SOURCE_MODE_INVALID', 'sourceMode must be FRESH or SNAPSHOT.', [
        { field: 'sourceMode', detail: 'Allowed values: ' + CONFIG.ALLOWED_SOURCE_MODES.join(', ') }
      ]);
    }

    const notes = normalizeString(rawPayload.notes);
    const items = Array.isArray(rawPayload.items) ? rawPayload.items : [];
    if (items.length === 0) {
      throw appError('ITEMS_REQUIRED', 'items must be a non-empty array.', [
        { field: 'items', detail: 'At least one item is required.' }
      ]);
    }

    const selectedItems = getSelectedItemsForAction(items, resolvedActionTag);
    if (selectedItems.length === 0) {
      throw appError('NO_SELECTED_ITEMS', 'No selected items found for this action.', [
        {
          field: resolvedActionTag === CONFIG.ACTION_TAGS.OWNER_APPROVED ? 'ownerChecked' : 'finalActionChecked',
          detail: 'Mark at least one item as selected before save.'
        }
      ]);
    }

    const consistency = CalcService.validateCategoryDiscountConsistency(selectedItems);
    if (!consistency.ok) {
      throw appError(
        'CATEGORY_DISCOUNT_MISMATCH',
        'specialDiscPct must be consistent for each category in the same save payload.',
        consistency.errors
      );
    }

    const brandOnlyLatestUpdate = toBoolean_(
      readAny_(rawPayload, ['brandOnlyLatestUpdate', 'BrandOnlyLatestUpdate', 'brandOnlyUpdate', 'BrandOnlyUpdate']),
      false
    );
    if (brandOnlyLatestUpdate) {
      if (resolvedActionTag !== CONFIG.ACTION_TAGS.OWNER_APPROVED) {
        throw appError('BRAND_ONLY_REQUIRES_OWNER_ACTION', 'Brand-only update is allowed only for Owner Approved rows.', [
          { field: 'actionTag', detail: resolvedActionTag }
        ]);
      }
      if (sourceMode !== CONFIG.SOURCE_MODES.SNAPSHOT) {
        throw appError('BRAND_ONLY_REQUIRES_SNAPSHOT', 'Brand-only update is allowed only from Show All Rates snapshot mode.', [
          { field: 'sourceMode', detail: sourceMode }
        ]);
      }
      return updatePartyItemBrandsOnly_({
        partyName: partyName,
        userEmail: userEmail,
        actionTag: resolvedActionTag,
        items: selectedItems
      });
    }

    const settings = MasterService.getSettingsMap();
    const requestedUpdateRefKey = normalizeString(
      readAny_(rawPayload, ['updateRefKey', 'UpdateRefKey', 'loadedRefKey', 'LoadedRefKey', 'targetRefKey', 'TargetRefKey'])
    );
    const requestUpdateExisting = toBoolean_(
      readAny_(rawPayload, ['requestUpdateExisting', 'RequestUpdateExisting', 'updateExisting', 'UpdateExisting']),
      false
    );
    const isUpdateMode = requestUpdateExisting || !isBlank(requestedUpdateRefKey);

    if (isUpdateMode && sourceMode !== CONFIG.SOURCE_MODES.SNAPSHOT) {
      throw appError('UPDATE_MODE_REQUIRES_SNAPSHOT', 'Updating an existing reference is allowed only in SNAPSHOT mode.', [
        { field: 'sourceMode', detail: 'Use sourceMode=SNAPSHOT when updating loaded reference.' }
      ]);
    }

    if (isUpdateMode && isBlank(requestedUpdateRefKey)) {
      throw appError('UPDATE_REFKEY_REQUIRED', 'updateRefKey is required for update mode.', [
        { field: 'updateRefKey', detail: 'Provide the loaded snapshot refKey to update in-place.' }
      ]);
    }

    if (isUpdateMode && !MasterService.isAdminUser(userEmail)) {
      throw appError('ADMIN_REQUIRED_FOR_UPDATE', 'Only ADMIN users can update an existing loaded reference.', [
        { field: 'userEmail', detail: userEmail }
      ]);
    }

    const refKey = isUpdateMode ? requestedUpdateRefKey : makeRefKey('rate');
    const createdAt = nowIso();
    const snapshotDateTime = createdAt;

    const builtItems = buildItemRows({
      refKey: refKey,
      partyName: partyName,
      actionTag: resolvedActionTag,
      snapshotDateTime: snapshotDateTime,
      userEmail: userEmail,
      createdAt: createdAt,
      settings: settings,
      items: selectedItems
    });

    const headerRow = buildHeaderRow({
      refKey: refKey,
      partyName: partyName,
      actionTag: resolvedActionTag,
      snapshotDateTime: snapshotDateTime,
      userEmail: userEmail,
      itemCount: builtItems.rows.length,
      notes: notes,
      sourceMode: sourceMode,
      createdAt: createdAt
    });

    if (isUpdateMode) {
      return updateExistingRefBatch_({
        refKey: refKey,
        partyName: partyName,
        actionTag: resolvedActionTag,
        sourceMode: sourceMode,
        notes: notes,
        userEmail: userEmail,
        createdAt: createdAt,
        snapshotDateTime: snapshotDateTime,
        headerRow: headerRow,
        builtItems: builtItems
      });
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (err) {
      throw appError('WRITE_LOCK_TIMEOUT', 'Could not acquire write lock. Please retry.', [
        { detail: err && err.message ? err.message : 'Lock timeout.' }
      ]);
    }

    try {
      appendRowsToSheet_(CONFIG.SHEETS.RATE_LOG_HEADER, CONFIG.WORKBOOK_SHEETS.RateLogHeader, [headerRow]);
      appendRowsToSheet_(CONFIG.SHEETS.RATE_LOG_ITEMS, CONFIG.WORKBOOK_SHEETS.RateLogItems, builtItems.rows);
      const brandSummary = upsertPartyItemBrands(builtItems.brandEntries);
      const latestSummary = upsertPartyItemLatest(builtItems.latestEntries);

      return {
        refKey: refKey,
        partyName: partyName,
        actionTag: resolvedActionTag,
        itemCount: builtItems.summary.length,
        savedItems: builtItems.summary,
        brandUpsert: brandSummary,
        latestUpsert: latestSummary
      };
    } finally {
      try {
        lock.releaseLock();
      } catch (ignore) {
        // no-op
      }
    }
  }

  function buildHeaderRow(context) {
    return [
      context.refKey,
      context.partyName,
      context.actionTag,
      context.snapshotDateTime,
      context.userEmail,
      context.itemCount,
      context.notes,
      context.sourceMode,
      context.createdAt
    ];
  }

  function buildItemRows(context) {
    const rows = [];
    const summary = [];
    const latestEntries = [];
    const brandEntries = [];
    const errors = [];
    const requiresBrand = context.actionTag === CONFIG.ACTION_TAGS.OWNER_APPROVED;

    for (let i = 0; i < context.items.length; i += 1) {
      const rawItem = context.items[i] || {};
      const normalizedItem = CalcService.normalizeEnums(rawItem);

      const category = normalizeString(readAny_(normalizedItem, ['category', 'Category']));
      const product = normalizeString(readAny_(normalizedItem, ['product', 'Product']));
      if (isBlank(category) || isBlank(product)) {
        errors.push({
          index: i,
          field: 'category/product',
          detail: 'Both category and product are required for selected items.'
        });
        continue;
      }

      const calcInput = {
        latestListPrice: readAny_(normalizedItem, ['latestListPrice', 'LatestListPrice']),
        paymentTerms: readAny_(normalizedItem, ['paymentTerms', 'PaymentTerms']),
        specialDiscPct: readAny_(normalizedItem, ['specialDiscPct', 'SpecialDiscPct']),
        GSTMode: readAny_(normalizedItem, ['GSTMode', 'gstMode']),
        FreightMode: readAny_(normalizedItem, ['FreightMode', 'freightMode']),
        CDMode: readAny_(normalizedItem, ['CDMode', 'cdMode']),
        cdPercent: readAny_(normalizedItem, ['cdPercent', 'CDPercent'])
      };

      let calc;
      let netRatesCalc;
      try {
        calc = CalcService.calculateItemRate(calcInput, context.settings);
        netRatesCalc = CalcService.calculateNetRates(calcInput, context.settings);
      } catch (err) {
        errors.push({
          index: i,
          field: 'calculation',
          detail: err && err.message ? err.message : 'Calculation failed.'
        });
        continue;
      }

      const latestListPriceInput = toSafeNumber(readAny_(normalizedItem, ['latestListPrice', 'LatestListPrice']), calc.latestListPrice);
      const previousListPriceInput = toSafeNumber(readAny_(normalizedItem, ['previousListPrice', 'PreviousListPrice']), null);
      const latestWEF = normalizeDateLikeToIsoDay_(readAny_(normalizedItem, ['latestWEF', 'LatestWEF']));
      const previousWEF = normalizeDateLikeToIsoDay_(readAny_(normalizedItem, ['previousWEF', 'PreviousWEF']));
      const ownerChecked = toBoolean_(readAny_(normalizedItem, ['ownerChecked', 'OwnerChecked']), false);
      const finalActionChecked = toBoolean_(readAny_(normalizedItem, ['finalActionChecked', 'FinalActionChecked']), false);
      const brand = normalizeString(readAny_(normalizedItem, ['brand', 'Brand', 'brandName', 'BrandName']));
      if (requiresBrand && isBlank(brand)) {
        errors.push({
          index: i,
          field: 'brand',
          detail: 'Brand is required for Owner Approved item: ' + product
        });
        continue;
      }

      rows.push([
        context.refKey,
        context.partyName,
        context.actionTag,
        context.snapshotDateTime,
        context.userEmail,
        category,
        product,
        calc.paymentTerms,
        round2(latestListPriceInput),
        latestWEF,
        previousListPriceInput === null ? '' : round2(previousListPriceInput),
        previousWEF,
        calc.tdPercent,
        calc.tdRate,
        calc.specialDiscPct,
        calc.afterSpecialDiscRate,
        calc.gstMode,
        calc.freightMode,
        calc.cdMode,
        calc.appliedCdPercent,
        calc.gstPercent,
        calc.gstAmount,
        calc.finalRate,
        netRatesCalc.finalRate,
        ownerChecked,
        finalActionChecked,
        context.createdAt,
        brand
      ]);

      summary.push({
        category: category,
        product: product,
        paymentTerms: calc.paymentTerms,
        latestListPrice: round2(latestListPriceInput),
        specialDiscPct: calc.specialDiscPct,
        gstMode: calc.gstMode,
        freightMode: calc.freightMode,
        cdMode: calc.cdMode,
        appliedCdPercent: calc.appliedCdPercent,
        finalRate: calc.finalRate,
        netRates: netRatesCalc.finalRate,
        brand: brand
      });

      latestEntries.push({
        partyName: context.partyName,
        category: category,
        product: product,
        lastRefKey: context.refKey,
        lastActionTag: context.actionTag,
        lastTimestamp: context.snapshotDateTime,
        lastUserEmail: context.userEmail,
        lastFinalRate: calc.finalRate,
        lastSpecialDiscPct: calc.specialDiscPct,
        lastGSTMode: calc.gstMode,
        lastFreightMode: calc.freightMode,
        lastCDMode: calc.cdMode,
        lastCDPercent: calc.appliedCdPercent,
        lastLatestListPrice: round2(latestListPriceInput),
        lastLatestWEF: latestWEF,
        lastBrand: brand
      });

      if (!isBlank(brand)) {
        brandEntries.push({
          partyName: context.partyName,
          category: category,
          product: product,
          brand: brand,
          updatedAt: context.snapshotDateTime,
          updatedBy: context.userEmail,
          lastRefKey: context.refKey
        });
      }
    }

    if (errors.length > 0) {
      throw appError('INVALID_SELECTED_ITEMS', 'One or more selected items are invalid.', errors);
    }
    if (rows.length === 0) {
      throw appError('NO_SELECTED_ITEMS', 'No valid selected items available to save.');
    }

    return {
      rows: rows,
      summary: summary,
      latestEntries: latestEntries,
      brandEntries: brandEntries
    };
  }

  function updateExistingRefBatch_(context) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (err) {
      throw appError('WRITE_LOCK_TIMEOUT', 'Could not acquire write lock. Please retry.', [
        { detail: err && err.message ? err.message : 'Lock timeout.' }
      ]);
    }

    try {
      const headerSheet = getSheetOrThrow(CONFIG.SHEETS.RATE_LOG_HEADER);
      const headerHeaders = CONFIG.WORKBOOK_SHEETS.RateLogHeader;
      ensureSheetHeader_(headerSheet, headerHeaders);
      const headerValues = getAllValues(headerSheet);
      const headerHeaderRow = headerValues.length > 0 ? headerValues[0] : headerHeaders;
      const headerMap = createNormalizedHeaderMapFromRow_(headerHeaderRow);
      const headerFallbackMap = createNormalizedHeaderMapFromRow_(headerHeaders);
      const idxHeaderRefKey = getHeaderIndex_(headerMap, headerFallbackMap, ['RefKey']);
      const idxHeaderParty = getHeaderIndex_(headerMap, headerFallbackMap, ['PartyName']);
      const idxHeaderActionTag = getHeaderIndex_(headerMap, headerFallbackMap, ['ActionTag']);
      const idxHeaderItemCount = getHeaderIndex_(headerMap, headerFallbackMap, ['ItemCount']);
      const idxHeaderNotes = getHeaderIndex_(headerMap, headerFallbackMap, ['Notes']);
      const idxHeaderSourceMode = getHeaderIndex_(headerMap, headerFallbackMap, ['SourceMode']);

      let matchedHeader = null;
      for (let i = 1; i < headerValues.length; i += 1) {
        const row = headerValues[i];
        if (normalizeString(readByIdx_(row, idxHeaderRefKey)) !== context.refKey) {
          continue;
        }
        if (matchedHeader) {
          throw appError('REFKEY_HEADER_AMBIGUOUS', 'Multiple RateLogHeader rows exist for the same refKey. Aborting update.', [
            { field: 'refKey', detail: context.refKey }
          ]);
        }
        matchedHeader = {
          rowNumber: i + 1,
          row: row
        };
      }

      if (!matchedHeader) {
        throw appError('REFKEY_NOT_FOUND', 'Loaded reference was not found in RateLogHeader.', [
          { field: 'refKey', detail: context.refKey }
        ]);
      }

      const existingHeaderParty = normalizeString(readByIdx_(matchedHeader.row, idxHeaderParty));
      if (normalizeKey(existingHeaderParty) !== normalizeKey(context.partyName)) {
        throw appError('REFKEY_PARTY_MISMATCH', 'Loaded reference does not belong to selected party. Aborting update.', [
          { field: 'refKey', detail: context.refKey },
          { field: 'selectedParty', detail: context.partyName },
          { field: 'refParty', detail: existingHeaderParty }
        ]);
      }

      const existingHeaderActionTag = normalizeActionTag_(readByIdx_(matchedHeader.row, idxHeaderActionTag));
      const existingHeaderItemCount = toSafeNumber(readByIdx_(matchedHeader.row, idxHeaderItemCount), 0);
      const existingHeaderNotes = normalizeString(readByIdx_(matchedHeader.row, idxHeaderNotes));
      const existingHeaderSourceMode = normalizeSourceMode_(readByIdx_(matchedHeader.row, idxHeaderSourceMode));

      const itemSheet = getSheetOrThrow(CONFIG.SHEETS.RATE_LOG_ITEMS);
      const itemHeaders = CONFIG.WORKBOOK_SHEETS.RateLogItems;
      ensureSheetHeader_(itemSheet, itemHeaders);
      const itemValues = getAllValues(itemSheet);
      const itemHeaderRow = itemValues.length > 0 ? itemValues[0] : itemHeaders;
      const itemMap = createNormalizedHeaderMapFromRow_(itemHeaderRow);
      const itemFallbackMap = createNormalizedHeaderMapFromRow_(itemHeaders);
      const idxItemRefKey = getHeaderIndex_(itemMap, itemFallbackMap, ['RefKey']);
      const idxItemCategory = getHeaderIndex_(itemMap, itemFallbackMap, ['Category']);
      const idxItemProduct = getHeaderIndex_(itemMap, itemFallbackMap, ['Product']);

      const existingItemsByKey = {};
      const duplicateRowNumbers = [];
      const orphanRowNumbers = [];

      for (let j = 1; j < itemValues.length; j += 1) {
        const row = itemValues[j];
        if (normalizeString(readByIdx_(row, idxItemRefKey)) !== context.refKey) {
          continue;
        }

        const itemKey = buildRefItemKey_(
          readByIdx_(row, idxItemCategory),
          readByIdx_(row, idxItemProduct)
        );
        const rowNumber = j + 1;

        if (isBlank(itemKey)) {
          orphanRowNumbers.push(rowNumber);
          continue;
        }

        if (!existingItemsByKey[itemKey]) {
          existingItemsByKey[itemKey] = { rowNumber: rowNumber, row: row };
          continue;
        }

        // Business-critical cleanup:
        // For a loaded refKey, category+product must identify a single editable row.
        // Any duplicates are cleared during this update to prevent future mismatches.
        duplicateRowNumbers.push(rowNumber);
      }

      const incomingItemsByKey = {};
      const incomingOrder = [];
      const incomingRows = context.builtItems.rows;
      for (let x = 0; x < incomingRows.length; x += 1) {
        const incomingRow = incomingRows[x];
        const incomingKey = buildRefItemKey_(
          readByIdx_(incomingRow, idxItemCategory),
          readByIdx_(incomingRow, idxItemProduct)
        );
        if (isBlank(incomingKey)) {
          throw appError('INVALID_SELECTED_ITEMS', 'Selected rows are missing category/product for update.', [
            { index: x, field: 'category/product', detail: 'Both fields are required.' }
          ]);
        }
        if (incomingItemsByKey[incomingKey]) {
          throw appError('DUPLICATE_SELECTED_ITEM', 'Duplicate category/product rows in save payload are not allowed.', [
            { field: 'itemKey', detail: incomingKey }
          ]);
        }
        incomingItemsByKey[incomingKey] = { row: incomingRow };
        incomingOrder.push(incomingKey);
      }

      const headerChanged =
        existingHeaderActionTag !== context.actionTag ||
        existingHeaderItemCount !== incomingRows.length ||
        existingHeaderNotes !== context.notes ||
        existingHeaderSourceMode !== context.sourceMode;

      const itemsChanged =
        duplicateRowNumbers.length > 0 ||
        orphanRowNumbers.length > 0 ||
        hasRefItemPayloadChanges_(incomingItemsByKey, existingItemsByKey, itemMap, itemFallbackMap);

      if (!headerChanged && !itemsChanged) {
        return {
          refKey: context.refKey,
          partyName: context.partyName,
          actionTag: context.actionTag,
          itemCount: context.builtItems.summary.length,
          savedItems: context.builtItems.summary,
          latestUpsert: { inserted: 0, updated: 0 },
          updateMode: 'UPDATED_EXISTING',
          updated: false,
          noChanges: true
        };
      }

      headerSheet
        .getRange(matchedHeader.rowNumber, 1, 1, headerHeaders.length)
        .setValues([context.headerRow]);

      let updatedItemRows = 0;
      const appendRows = [];
      const staleRowNumbers = [];

      for (let p = 0; p < incomingOrder.length; p += 1) {
        const key = incomingOrder[p];
        const incoming = incomingItemsByKey[key];
        const existing = existingItemsByKey[key];
        if (!existing) {
          appendRows.push(incoming.row);
          continue;
        }

        itemSheet
          .getRange(existing.rowNumber, 1, 1, itemHeaders.length)
          .setValues([incoming.row]);
        updatedItemRows += 1;
      }

      const existingKeys = Object.keys(existingItemsByKey);
      for (let q = 0; q < existingKeys.length; q += 1) {
        const key = existingKeys[q];
        if (!incomingItemsByKey[key]) {
          staleRowNumbers.push(existingItemsByKey[key].rowNumber);
        }
      }

      const rowsToClear = staleRowNumbers.concat(duplicateRowNumbers, orphanRowNumbers);
      for (let r = 0; r < rowsToClear.length; r += 1) {
        itemSheet.getRange(rowsToClear[r], 1, 1, itemHeaders.length).clearContent();
      }

      if (appendRows.length > 0) {
        const startRow = itemSheet.getLastRow() + 1;
        itemSheet.getRange(startRow, 1, appendRows.length, itemHeaders.length).setValues(appendRows);
      }

      const brandSummary = upsertPartyItemBrands(context.builtItems.brandEntries);
      const latestSummary = upsertPartyItemLatest(context.builtItems.latestEntries);

      return {
        refKey: context.refKey,
        partyName: context.partyName,
        actionTag: context.actionTag,
        itemCount: context.builtItems.summary.length,
        savedItems: context.builtItems.summary,
        brandUpsert: brandSummary,
        latestUpsert: latestSummary,
        updateMode: 'UPDATED_EXISTING',
        updated: true,
        noChanges: false,
        updatedItemRows: updatedItemRows,
        appendedItemRows: appendRows.length,
        clearedItemRows: rowsToClear.length
      };
    } finally {
      try {
        lock.releaseLock();
      } catch (ignore) {
        // no-op
      }
    }
  }

  function buildRefItemKey_(category, product) {
    const categoryKey = normalizeKey(category);
    const productKey = normalizeKey(product);
    if (isBlank(categoryKey) || isBlank(productKey)) {
      return '';
    }
    return categoryKey + '|' + productKey;
  }

  function hasRefItemPayloadChanges_(incomingItemsByKey, existingItemsByKey, itemMap, itemFallbackMap) {
    const incomingKeys = Object.keys(incomingItemsByKey).sort();
    const existingKeys = Object.keys(existingItemsByKey).sort();

    if (incomingKeys.length !== existingKeys.length) {
      return true;
    }

    for (let i = 0; i < incomingKeys.length; i += 1) {
      if (incomingKeys[i] !== existingKeys[i]) {
        return true;
      }
    }

    for (let j = 0; j < incomingKeys.length; j += 1) {
      const key = incomingKeys[j];
      const incomingSignature = createComparableItemSignature_(
        incomingItemsByKey[key].row,
        itemMap,
        itemFallbackMap
      );
      const existingSignature = createComparableItemSignature_(
        existingItemsByKey[key].row,
        itemMap,
        itemFallbackMap
      );
      if (incomingSignature !== existingSignature) {
        return true;
      }
    }

    return false;
  }

  function createComparableItemSignature_(row, map, fallbackMap) {
    const idxParty = getHeaderIndex_(map, fallbackMap, ['PartyName']);
    const idxActionTag = getHeaderIndex_(map, fallbackMap, ['ActionTag']);
    const idxCategory = getHeaderIndex_(map, fallbackMap, ['Category']);
    const idxProduct = getHeaderIndex_(map, fallbackMap, ['Product']);
    const idxPaymentTerms = getHeaderIndex_(map, fallbackMap, ['PaymentTerms']);
    const idxLatestListPrice = getHeaderIndex_(map, fallbackMap, ['LatestListPrice']);
    const idxLatestWEF = getHeaderIndex_(map, fallbackMap, ['LatestWEF']);
    const idxPreviousListPrice = getHeaderIndex_(map, fallbackMap, ['PreviousListPrice']);
    const idxPreviousWEF = getHeaderIndex_(map, fallbackMap, ['PreviousWEF']);
    const idxTDPercent = getHeaderIndex_(map, fallbackMap, ['TDPercent']);
    const idxTDRate = getHeaderIndex_(map, fallbackMap, ['TD20Rate']);
    const idxSpecialDiscPct = getHeaderIndex_(map, fallbackMap, ['SpecialDiscPct']);
    const idxAfterSpecial = getHeaderIndex_(map, fallbackMap, ['AfterSpecialDiscRate']);
    const idxGstMode = getHeaderIndex_(map, fallbackMap, ['GSTMode']);
    const idxFreightMode = getHeaderIndex_(map, fallbackMap, ['FreightMode']);
    const idxCdMode = getHeaderIndex_(map, fallbackMap, ['CDMode']);
    const idxCdPercent = getHeaderIndex_(map, fallbackMap, ['CDPercent']);
    const idxGstPercent = getHeaderIndex_(map, fallbackMap, ['GSTPercent']);
    const idxGstAmount = getHeaderIndex_(map, fallbackMap, ['GSTAmount']);
    const idxFinalRate = getHeaderIndex_(map, fallbackMap, ['FinalRate']);
    const idxNetRates = getHeaderIndex_(map, fallbackMap, ['NetRates']);
    const idxOwnerChecked = getHeaderIndex_(map, fallbackMap, ['OwnerChecked']);
    const idxFinalChecked = getHeaderIndex_(map, fallbackMap, ['FinalActionChecked']);
    const idxBrand = getHeaderIndex_(map, fallbackMap, ['Brand']);

    return [
      normalizeKey(readByIdx_(row, idxParty)),
      normalizeActionTag_(readByIdx_(row, idxActionTag)),
      normalizeKey(readByIdx_(row, idxCategory)),
      normalizeKey(readByIdx_(row, idxProduct)),
      normalizeNumericSignature_(readByIdx_(row, idxPaymentTerms), false),
      normalizeNumericSignature_(readByIdx_(row, idxLatestListPrice), false),
      normalizeString(readByIdx_(row, idxLatestWEF)),
      normalizeNumericSignature_(readByIdx_(row, idxPreviousListPrice), true),
      normalizeString(readByIdx_(row, idxPreviousWEF)),
      normalizeNumericSignature_(readByIdx_(row, idxTDPercent), false),
      normalizeNumericSignature_(readByIdx_(row, idxTDRate), false),
      normalizeNumericSignature_(readByIdx_(row, idxSpecialDiscPct), false),
      normalizeNumericSignature_(readByIdx_(row, idxAfterSpecial), false),
      normalizeKey(readByIdx_(row, idxGstMode)),
      normalizeKey(readByIdx_(row, idxFreightMode)),
      normalizeKey(readByIdx_(row, idxCdMode)),
      normalizeNumericSignature_(readByIdx_(row, idxCdPercent), false),
      normalizeNumericSignature_(readByIdx_(row, idxGstPercent), false),
      normalizeNumericSignature_(readByIdx_(row, idxGstAmount), false),
      normalizeNumericSignature_(readByIdx_(row, idxFinalRate), false),
      normalizeNumericSignature_(readByIdx_(row, idxNetRates), true),
      toBoolean_(readByIdx_(row, idxOwnerChecked), false) ? '1' : '0',
      toBoolean_(readByIdx_(row, idxFinalChecked), false) ? '1' : '0',
      normalizeKey(readByIdx_(row, idxBrand))
    ].join('|');
  }

  function normalizeNumericSignature_(value, allowBlank) {
    if (isBlank(value)) {
      return allowBlank ? '' : '0';
    }
    const num = toSafeNumber(value, null);
    if (num === null) {
      return normalizeString(value);
    }
    return String(round2(num));
  }

  function updatePartyItemBrandsOnly_(context) {
    const entries = [];
    const errors = [];
    const now = nowIso();
    const latestActionByKey = getLatestRateActionMapForParty_(context.partyName);

    for (let i = 0; i < context.items.length; i += 1) {
      const item = context.items[i] || {};
      const category = normalizeString(readAny_(item, ['category', 'Category']));
      const product = normalizeString(readAny_(item, ['product', 'Product']));
      const brand = normalizeString(readAny_(item, ['brand', 'Brand', 'brandName', 'BrandName']));
      const itemActionTag = normalizeActionTag_(readAny_(item, ['actionTag', 'ActionTag']));

      if (isBlank(category) || isBlank(product)) {
        errors.push({
          index: i,
          field: 'category/product',
          detail: 'Both category and product are required for Brand update.'
        });
        continue;
      }
      if (!isBlank(itemActionTag) && itemActionTag !== CONFIG.ACTION_TAGS.OWNER_APPROVED) {
        errors.push({
          index: i,
          field: 'actionTag',
          detail: 'Brand can be updated from Show All Rates only for Owner Approved rows.'
        });
        continue;
      }
      if (latestActionByKey[buildLatestKey_(context.partyName, category, product)] !== CONFIG.ACTION_TAGS.OWNER_APPROVED) {
        errors.push({
          index: i,
          field: 'actionTag',
          detail: 'Latest saved rate is not Owner Approved for item: ' + product
        });
        continue;
      }
      if (isBlank(brand)) {
        errors.push({
          index: i,
          field: 'brand',
          detail: 'Brand is required for item: ' + product
        });
        continue;
      }

      entries.push({
        partyName: context.partyName,
        category: category,
        product: product,
        brand: brand,
        updatedAt: now,
        updatedBy: context.userEmail,
        lastRefKey: normalizeString(readAny_(item, ['refKey', 'RefKey', 'lastRefKey', 'LastRefKey']))
      });
    }

    if (errors.length > 0) {
      throw appError('INVALID_BRAND_UPDATE_ITEMS', 'One or more selected Brand updates are invalid.', errors);
    }
    if (entries.length === 0) {
      throw appError('NO_BRAND_UPDATE_ITEMS', 'No valid selected items available for Brand update.');
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (err) {
      throw appError('WRITE_LOCK_TIMEOUT', 'Could not acquire write lock. Please retry.', [
        { detail: err && err.message ? err.message : 'Lock timeout.' }
      ]);
    }

    try {
      const brandSummary = upsertPartyItemBrands(entries);
      const latestBrandSummary = updatePartyItemLatestBrands_(entries);
      return {
        refKey: 'BRAND_ONLY',
        partyName: context.partyName,
        actionTag: context.actionTag,
        itemCount: entries.length,
        savedItems: entries.map(function (entry) {
          return {
            category: entry.category,
            product: entry.product,
            brand: entry.brand
          };
        }),
        brandUpsert: brandSummary,
        latestBrandUpdate: latestBrandSummary,
        brandOnlyUpdate: true
      };
    } finally {
      try {
        lock.releaseLock();
      } catch (ignore) {
        // no-op
      }
    }
  }

  function getLatestRateActionMapForParty_(partyName) {
    const sheet = getSheetOrThrow(CONFIG.SHEETS.RATE_LOG_ITEMS);
    const values = getAllValues(sheet);
    const out = {};
    if (values.length <= 1) {
      return out;
    }

    const headers = values[0];
    const map = createNormalizedHeaderMapFromRow_(headers);
    const fallbackMap = createNormalizedHeaderMapFromRow_(CONFIG.WORKBOOK_SHEETS.RateLogItems);
    const idxParty = getHeaderIndex_(map, fallbackMap, ['PartyName']);
    const idxCategory = getHeaderIndex_(map, fallbackMap, ['Category']);
    const idxProduct = getHeaderIndex_(map, fallbackMap, ['Product']);
    const idxActionTag = getHeaderIndex_(map, fallbackMap, ['ActionTag']);
    const idxSnapshot = getHeaderIndex_(map, fallbackMap, ['SnapshotDateTime']);
    const idxCreatedAt = getHeaderIndex_(map, fallbackMap, ['CreatedAt']);
    const targetKey = normalizeKey(partyName);
    const latestByKey = {};

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i];
      const rowParty = normalizeString(readByIdx_(row, idxParty));
      const category = normalizeString(readByIdx_(row, idxCategory));
      const product = normalizeString(readByIdx_(row, idxProduct));
      if (isBlank(rowParty) || isBlank(category) || isBlank(product)) {
        continue;
      }
      if (normalizeKey(rowParty) !== targetKey) {
        continue;
      }

      const key = buildLatestKey_(rowParty, category, product);
      const epoch = maxEpoch_([
        readByIdx_(row, idxSnapshot),
        readByIdx_(row, idxCreatedAt)
      ]);
      const candidate = {
        actionTag: normalizeActionTag_(readByIdx_(row, idxActionTag)),
        epoch: epoch,
        rowNumber: i + 1
      };
      const existing = latestByKey[key];
      if (!existing || candidate.epoch > existing.epoch || (
        candidate.epoch === existing.epoch && candidate.rowNumber > existing.rowNumber
      )) {
        latestByKey[key] = candidate;
      }
    }

    const keys = Object.keys(latestByKey);
    for (let j = 0; j < keys.length; j += 1) {
      out[keys[j]] = latestByKey[keys[j]].actionTag;
    }
    return out;
  }

  function upsertPartyItemBrands(entries) {
    const safeEntries = Array.isArray(entries) ? entries.filter(function (entry) {
      return entry && !isBlank(entry.brand);
    }) : [];
    if (safeEntries.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const headers = CONFIG.WORKBOOK_SHEETS.PartyItemBrands;
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.PARTY_ITEM_BRANDS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.PARTY_ITEM_BRANDS);
    }
    ensureSheetHeader_(sheet, headers);

    const allValues = getAllValues(sheet);
    const dataRows = allValues.length > 1 ? allValues.slice(1) : [];
    const headerMap = createHeaderMap_(headers);
    const existingByKey = {};

    for (let i = 0; i < dataRows.length; i += 1) {
      const row = dataRows[i];
      const key = buildLatestKey_(
        row[headerMap.PartyName],
        row[headerMap.Category],
        row[headerMap.Product]
      );
      if (!isBlank(key)) {
        existingByKey[key] = { rowIndex: i };
      }
    }

    const newRows = [];
    let updated = 0;
    let hasDataRowMutations = false;

    for (let j = 0; j < safeEntries.length; j += 1) {
      const entry = safeEntries[j];
      const key = buildLatestKey_(entry.partyName, entry.category, entry.product);
      if (isBlank(key)) {
        continue;
      }

      const row = buildPartyItemBrandRow_(entry, headers);
      const existing = existingByKey[key];
      if (!existing) {
        newRows.push(row);
        existingByKey[key] = { rowIndex: dataRows.length + newRows.length - 1 };
        continue;
      }

      dataRows[existing.rowIndex] = row;
      updated += 1;
      hasDataRowMutations = true;
    }

    if (hasDataRowMutations && dataRows.length > 0) {
      sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
    }

    if (newRows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, newRows.length, headers.length).setValues(newRows);
    }

    return {
      inserted: newRows.length,
      updated: updated
    };
  }

  function buildPartyItemBrandRow_(entry, headers) {
    const map = createHeaderMap_(headers);
    const row = new Array(headers.length).fill('');
    row[map.PartyName] = normalizeString(entry.partyName);
    row[map.Product] = normalizeString(entry.product);
    row[map.Category] = normalizeString(entry.category);
    row[map.Brand] = normalizeString(entry.brand);
    row[map.UpdatedAt] = normalizeString(entry.updatedAt);
    row[map.UpdatedBy] = normalizeString(entry.updatedBy);
    row[map.LastRefKey] = normalizeString(entry.lastRefKey);
    return row;
  }

  function getPartyItemBrandMap_(partyName) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.PARTY_ITEM_BRANDS);
    if (!sheet) {
      return {};
    }
    const values = getAllValues(sheet);
    const out = {};
    if (values.length <= 1) {
      return out;
    }

    const headers = values[0];
    const map = createNormalizedHeaderMapFromRow_(headers);
    const fallbackMap = createNormalizedHeaderMapFromRow_(CONFIG.WORKBOOK_SHEETS.PartyItemBrands);
    const idxParty = getHeaderIndex_(map, fallbackMap, ['PartyName']);
    const idxCategory = getHeaderIndex_(map, fallbackMap, ['Category']);
    const idxProduct = getHeaderIndex_(map, fallbackMap, ['Product']);
    const idxBrand = getHeaderIndex_(map, fallbackMap, ['Brand']);
    const targetKey = normalizeKey(partyName);

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i];
      const rowParty = normalizeString(readByIdx_(row, idxParty));
      const category = normalizeString(readByIdx_(row, idxCategory));
      const product = normalizeString(readByIdx_(row, idxProduct));
      const brand = normalizeString(readByIdx_(row, idxBrand));
      if (isBlank(rowParty) || isBlank(category) || isBlank(product) || isBlank(brand)) {
        continue;
      }
      if (!isBlank(targetKey) && normalizeKey(rowParty) !== targetKey) {
        continue;
      }
      out[buildLatestKey_(rowParty, category, product)] = brand;
    }

    return out;
  }

  function applyBrandMapToItemObject_(item, brandMap, fallbackPartyName) {
    if (!item || typeof item !== 'object') {
      return item;
    }

    const partyName = normalizeString(item.PartyName || item.partyName || fallbackPartyName);
    const category = normalizeString(item.Category || item.category);
    const product = normalizeString(item.Product || item.product);
    const key = buildLatestKey_(partyName, category, product);
    const savedBrand = brandMap[key];
    if (!isBlank(savedBrand)) {
      item.Brand = savedBrand;
      item.brand = savedBrand;
      item.LastBrand = savedBrand;
      item.lastBrand = savedBrand;
    }
    return item;
  }

  function updatePartyItemLatestBrands_(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return { updated: 0 };
    }

    const sheet = getSheetOrThrow(CONFIG.SHEETS.PARTY_ITEM_LATEST);
    const headers = CONFIG.WORKBOOK_SHEETS.PartyItemLatest;
    ensureSheetHeader_(sheet, headers);
    const allValues = getAllValues(sheet);
    if (allValues.length <= 1) {
      return { updated: 0 };
    }

    const dataRows = allValues.slice(1);
    const map = createHeaderMap_(headers);
    const brandByKey = {};
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const key = buildLatestKey_(entry.partyName, entry.category, entry.product);
      if (!isBlank(key) && !isBlank(entry.brand)) {
        brandByKey[key] = normalizeString(entry.brand);
      }
    }

    let updated = 0;
    for (let j = 0; j < dataRows.length; j += 1) {
      const row = dataRows[j];
      const key = buildLatestKey_(row[map.PartyName], row[map.Category], row[map.Product]);
      const brand = brandByKey[key];
      if (isBlank(brand) || normalizeString(row[map.LastBrand]) === brand) {
        continue;
      }
      row[map.LastBrand] = brand;
      updated += 1;
    }

    if (updated > 0) {
      sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
    }

    return { updated: updated };
  }

  function upsertPartyItemLatest(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const sheet = getSheetOrThrow(CONFIG.SHEETS.PARTY_ITEM_LATEST);
    const headers = CONFIG.WORKBOOK_SHEETS.PartyItemLatest;
    ensureSheetHeader_(sheet, headers);

    const allValues = getAllValues(sheet);
    const dataRows = allValues.length > 1 ? allValues.slice(1) : [];
    const headerMap = createHeaderMap_(headers);
    const existingByKey = {};

    for (let i = 0; i < dataRows.length; i += 1) {
      const row = dataRows[i];
      const key = buildLatestKey_(
        row[headerMap.PartyName],
        row[headerMap.Category],
        row[headerMap.Product]
      );
      if (isBlank(key)) {
        continue;
      }

      const epoch = toEpoch_(row[headerMap.LastTimestamp]);
      if (!existingByKey[key] || epoch > existingByKey[key].epoch) {
        existingByKey[key] = { rowIndex: i, epoch: epoch };
      }
    }

    const incomingByKey = {};
    const incomingOrder = [];
    for (let j = 0; j < entries.length; j += 1) {
      const entry = entries[j];
      const key = buildLatestKey_(entry.partyName, entry.category, entry.product);
      if (isBlank(key)) {
        continue;
      }

      const epoch = toEpoch_(entry.lastTimestamp);
      if (!incomingByKey[key] || epoch >= incomingByKey[key].epoch) {
        incomingByKey[key] = { entry: entry, epoch: epoch };
      }
      if (incomingOrder.indexOf(key) < 0) {
        incomingOrder.push(key);
      }
    }

    const newRows = [];
    let updated = 0;
    let hasDataRowMutations = false;

    for (let k = 0; k < incomingOrder.length; k += 1) {
      const key = incomingOrder[k];
      const incoming = incomingByKey[key];
      const row = buildPartyItemLatestRow_(incoming.entry, headers);
      const existing = existingByKey[key];

      if (!existing) {
        newRows.push(row);
        continue;
      }

      if (incoming.epoch >= existing.epoch) {
        dataRows[existing.rowIndex] = row;
        updated += 1;
        hasDataRowMutations = true;
      }
    }

    if (hasDataRowMutations && dataRows.length > 0) {
      sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
    }

    if (newRows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, newRows.length, headers.length).setValues(newRows);
    }

    return {
      inserted: newRows.length,
      updated: updated
    };
  }

  function getSelectedItemsForAction(items, actionTag) {
    const safeItems = Array.isArray(items) ? items : [];
    const normalizedActionTag = normalizeActionTag_(actionTag);
    const useOwnerSelection = normalizedActionTag === CONFIG.ACTION_TAGS.OWNER_APPROVED;
    const selected = [];

    for (let i = 0; i < safeItems.length; i += 1) {
      const item = safeItems[i] || {};
      const checked = useOwnerSelection
        ? toBoolean_(readAny_(item, ['ownerChecked', 'OwnerChecked']), false)
        : toBoolean_(readAny_(item, ['finalActionChecked', 'FinalActionChecked']), false);

      if (checked) {
        selected.push(item);
      }
    }

    return selected;
  }

  function getPartySnapshots(partyName) {
    const requestedParty = normalizeString(partyName);
    if (isBlank(requestedParty)) {
      throw appError('PARTY_REQUIRED', 'partyName is required.', [
        { field: 'partyName', detail: 'Use query parameter partyName.' }
      ]);
    }

    const sheet = getSheetOrThrow(CONFIG.SHEETS.RATE_LOG_HEADER);
    const values = getAllValues(sheet);
    if (values.length <= 1) {
      return {
        partyName: requestedParty,
        snapshots: [],
        count: 0
      };
    }

    const headerRow = values[0];
    const map = createNormalizedHeaderMapFromRow_(headerRow);
    const fallbackMap = createNormalizedHeaderMapFromRow_(CONFIG.WORKBOOK_SHEETS.RateLogHeader);

    const idxRefKey = getHeaderIndex_(map, fallbackMap, ['RefKey']);
    const idxParty = getHeaderIndex_(map, fallbackMap, ['PartyName']);
    const idxSnapshot = getHeaderIndex_(map, fallbackMap, ['SnapshotDateTime']);
    const idxActionTag = getHeaderIndex_(map, fallbackMap, ['ActionTag']);
    const idxItemCount = getHeaderIndex_(map, fallbackMap, ['ItemCount']);
    const idxUserEmail = getHeaderIndex_(map, fallbackMap, ['UserEmail']);
    const idxCreatedAt = getHeaderIndex_(map, fallbackMap, ['CreatedAt']);

    const targetKey = normalizeKey(requestedParty);
    const byRef = {};

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i];
      const rowRefKey = normalizeString(readByIdx_(row, idxRefKey));
      const rowParty = normalizeString(readByIdx_(row, idxParty));
      if (isBlank(rowRefKey) || isBlank(rowParty)) {
        continue;
      }
      if (normalizeKey(rowParty) !== targetKey) {
        continue;
      }

      const snapshotDateTime = normalizeString(readByIdx_(row, idxSnapshot));
      const createdAt = normalizeString(readByIdx_(row, idxCreatedAt));
      const sortEpoch = maxEpoch_([snapshotDateTime, createdAt]);

      const candidate = {
        refKey: rowRefKey,
        snapshotDateTime: snapshotDateTime,
        actionTag: normalizeString(readByIdx_(row, idxActionTag)),
        itemCount: toSafeNumber(readByIdx_(row, idxItemCount), 0),
        userEmail: normalizeString(readByIdx_(row, idxUserEmail)),
        partyName: rowParty,
        _epoch: sortEpoch
      };

      const existing = byRef[rowRefKey];
      if (!existing || candidate._epoch >= existing._epoch) {
        byRef[rowRefKey] = candidate;
      }
    }

    const snapshots = Object.keys(byRef).map(function (ref) {
      const item = byRef[ref];
      return {
        refKey: item.refKey,
        snapshotDateTime: item.snapshotDateTime,
        actionTag: item.actionTag,
        itemCount: item.itemCount,
        userEmail: item.userEmail,
        _epoch: item._epoch
      };
    });

    snapshots.sort(function (a, b) {
      if (b._epoch !== a._epoch) {
        return b._epoch - a._epoch;
      }
      return b.refKey.localeCompare(a.refKey);
    });

    for (let x = 0; x < snapshots.length; x += 1) {
      delete snapshots[x]._epoch;
    }

    return {
      partyName: requestedParty,
      snapshots: snapshots,
      count: snapshots.length
    };
  }

  function getSnapshotByRef(refKey) {
    const targetRefKey = normalizeString(refKey);
    if (isBlank(targetRefKey)) {
      throw appError('REFKEY_REQUIRED', 'refKey is required.', [
        { field: 'refKey', detail: 'Use query parameter refKey.' }
      ]);
    }

    const headerSheet = getSheetOrThrow(CONFIG.SHEETS.RATE_LOG_HEADER);
    const headerValues = getAllValues(headerSheet);
    let headerRecord = null;

    if (headerValues.length > 1) {
      const headerNames = headerValues[0];
      const headerMap = createNormalizedHeaderMapFromRow_(headerNames);
      const fallbackMap = createNormalizedHeaderMapFromRow_(CONFIG.WORKBOOK_SHEETS.RateLogHeader);
      const idxRefKey = getHeaderIndex_(headerMap, fallbackMap, ['RefKey']);
      const idxSnapshot = getHeaderIndex_(headerMap, fallbackMap, ['SnapshotDateTime']);
      const idxCreatedAt = getHeaderIndex_(headerMap, fallbackMap, ['CreatedAt']);

      for (let i = 1; i < headerValues.length; i += 1) {
        const row = headerValues[i];
        const rowRefKey = normalizeString(readByIdx_(row, idxRefKey));
        if (rowRefKey !== targetRefKey) {
          continue;
        }

        const rowObj = rowToObject_(headerNames, row);
        rowObj._epoch = maxEpoch_([
          readByIdx_(row, idxSnapshot),
          readByIdx_(row, idxCreatedAt)
        ]);

        if (!headerRecord || rowObj._epoch >= headerRecord._epoch) {
          headerRecord = rowObj;
        }
      }
    }

    if (!headerRecord) {
      throw appError('SNAPSHOT_NOT_FOUND', 'No snapshot found for refKey.', [
        { field: 'refKey', detail: targetRefKey }
      ]);
    }

    const itemSheet = getSheetOrThrow(CONFIG.SHEETS.RATE_LOG_ITEMS);
    const itemValues = getAllValues(itemSheet);
    const items = [];

    if (itemValues.length > 1) {
      const itemHeaders = itemValues[0];
      const itemMap = createNormalizedHeaderMapFromRow_(itemHeaders);
      const fallbackMap = createNormalizedHeaderMapFromRow_(CONFIG.WORKBOOK_SHEETS.RateLogItems);
      const idxRefKey = getHeaderIndex_(itemMap, fallbackMap, ['RefKey']);
      const idxSnapshot = getHeaderIndex_(itemMap, fallbackMap, ['SnapshotDateTime']);
      const idxCreatedAt = getHeaderIndex_(itemMap, fallbackMap, ['CreatedAt']);

      for (let j = 1; j < itemValues.length; j += 1) {
        const row = itemValues[j];
        const rowRefKey = normalizeString(readByIdx_(row, idxRefKey));
        if (rowRefKey !== targetRefKey) {
          continue;
        }

        const rowObj = rowToObject_(itemHeaders, row);
        rowObj._epoch = maxEpoch_([
          readByIdx_(row, idxSnapshot),
          readByIdx_(row, idxCreatedAt)
        ]);
        items.push(rowObj);
      }
    }

    const snapshotPartyName = normalizeString(headerRecord.PartyName || headerRecord.partyName);
    const brandMap = getPartyItemBrandMap_(snapshotPartyName);
    for (let b = 0; b < items.length; b += 1) {
      applyBrandMapToItemObject_(items[b], brandMap, snapshotPartyName);
    }

    items.sort(function (a, b) {
      if (b._epoch !== a._epoch) {
        return b._epoch - a._epoch;
      }
      const aCategory = normalizeString(a.Category || a.category);
      const bCategory = normalizeString(b.Category || b.category);
      const categorySort = aCategory.localeCompare(bCategory);
      if (categorySort !== 0) {
        return categorySort;
      }
      const aProduct = normalizeString(a.Product || a.product);
      const bProduct = normalizeString(b.Product || b.product);
      return aProduct.localeCompare(bProduct);
    });

    for (let k = 0; k < items.length; k += 1) {
      delete items[k]._epoch;
    }
    delete headerRecord._epoch;

    return {
      refKey: targetRefKey,
      header: headerRecord,
      items: items,
      itemCount: items.length
    };
  }

  function getAllLatestRates(partyName) {
    const requestedParty = normalizeString(partyName);
    const requestedPartyKey = normalizeKey(requestedParty);
    const itemSheet = getSheetOrThrow(CONFIG.SHEETS.RATE_LOG_ITEMS);
    const itemValues = getAllValues(itemSheet);
    if (itemValues.length <= 1) {
      return {
        refKey: 'SHOW_ALL_RATES',
        header: {
          RefKey: 'SHOW_ALL_RATES',
          PartyName: requestedParty || 'All Parties',
          ActionTag: 'OWNER_APPROVED',
          SnapshotDateTime: nowIso(),
          ItemCount: 0
        },
        items: [],
        itemCount: 0
      };
    }

    const headers = itemValues[0];
    const map = createNormalizedHeaderMapFromRow_(headers);
    const fallbackMap = createNormalizedHeaderMapFromRow_(CONFIG.WORKBOOK_SHEETS.RateLogItems);
    const idxParty = getHeaderIndex_(map, fallbackMap, ['PartyName']);
    const idxCategory = getHeaderIndex_(map, fallbackMap, ['Category']);
    const idxProduct = getHeaderIndex_(map, fallbackMap, ['Product']);
    const idxSnapshot = getHeaderIndex_(map, fallbackMap, ['SnapshotDateTime']);
    const idxCreatedAt = getHeaderIndex_(map, fallbackMap, ['CreatedAt']);

    const latestByKey = {};
    for (let i = 1; i < itemValues.length; i += 1) {
      const row = itemValues[i];
      const partyName = normalizeString(readByIdx_(row, idxParty));
      const category = normalizeString(readByIdx_(row, idxCategory));
      const product = normalizeString(readByIdx_(row, idxProduct));
      if (isBlank(partyName) || isBlank(category) || isBlank(product)) {
        continue;
      }
      if (!isBlank(requestedPartyKey) && normalizeKey(partyName) !== requestedPartyKey) {
        continue;
      }

      const epoch = maxEpoch_([
        readByIdx_(row, idxSnapshot),
        readByIdx_(row, idxCreatedAt)
      ]);
      const key = buildLatestKey_(partyName, category, product);
      const candidate = {
        row: row,
        epoch: epoch,
        rowNumber: i + 1
      };

      const existing = latestByKey[key];
      if (!existing || candidate.epoch > existing.epoch || (
        candidate.epoch === existing.epoch && candidate.rowNumber > existing.rowNumber
      )) {
        latestByKey[key] = candidate;
      }
    }

    const items = Object.keys(latestByKey).map(function (key) {
      const item = latestByKey[key];
      const rowObj = rowToObject_(headers, item.row);
      rowObj._epoch = item.epoch;
      rowObj._rowNumber = item.rowNumber;
      return rowObj;
    });

    const brandMap = getPartyItemBrandMap_(requestedParty);
    for (let b = 0; b < items.length; b += 1) {
      applyBrandMapToItemObject_(items[b], brandMap, requestedParty);
    }

    items.sort(function (a, b) {
      const partySort = normalizeString(a.PartyName || a.partyName).localeCompare(normalizeString(b.PartyName || b.partyName));
      if (partySort !== 0) {
        return partySort;
      }
      const categorySort = normalizeString(a.Category || a.category).localeCompare(normalizeString(b.Category || b.category));
      if (categorySort !== 0) {
        return categorySort;
      }
      return normalizeString(a.Product || a.product).localeCompare(normalizeString(b.Product || b.product));
    });

    for (let j = 0; j < items.length; j += 1) {
      delete items[j]._epoch;
      delete items[j]._rowNumber;
    }

    return {
      refKey: 'SHOW_ALL_RATES',
      header: {
        RefKey: 'SHOW_ALL_RATES',
        PartyName: requestedParty || 'All Parties',
        ActionTag: 'OWNER_APPROVED',
        SnapshotDateTime: nowIso(),
        ItemCount: items.length
      },
      items: items,
      itemCount: items.length
    };
  }

  function getPartyLatestHistory(partyName) {
    const requestedParty = normalizeString(partyName);
    if (isBlank(requestedParty)) {
      throw appError('PARTY_REQUIRED', 'partyName is required.', [
        { field: 'partyName', detail: 'Use query parameter partyName.' }
      ]);
    }

    const sheet = getSheetOrThrow(CONFIG.SHEETS.PARTY_ITEM_LATEST);
    const values = getAllValues(sheet);
    if (values.length <= 1) {
      return {
        partyName: requestedParty,
        items: [],
        count: 0
      };
    }

    const headers = values[0];
    const map = createNormalizedHeaderMapFromRow_(headers);
    const fallbackMap = createNormalizedHeaderMapFromRow_(CONFIG.WORKBOOK_SHEETS.PartyItemLatest);

    const idxParty = getHeaderIndex_(map, fallbackMap, ['PartyName']);
    const idxCategory = getHeaderIndex_(map, fallbackMap, ['Category']);
    const idxProduct = getHeaderIndex_(map, fallbackMap, ['Product']);

    const targetKey = normalizeKey(requestedParty);
    const brandMap = getPartyItemBrandMap_(requestedParty);
    const items = [];

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i];
      const rowParty = normalizeString(readByIdx_(row, idxParty));
      const rowCategory = normalizeString(readByIdx_(row, idxCategory));
      const rowProduct = normalizeString(readByIdx_(row, idxProduct));

      if (isBlank(rowParty) || isBlank(rowCategory) || isBlank(rowProduct)) {
        continue;
      }
      if (normalizeKey(rowParty) !== targetKey) {
        continue;
      }

      const itemObj = rowToObject_(headers, row);
      applyBrandMapToItemObject_(itemObj, brandMap, requestedParty);
      items.push(itemObj);
    }

    items.sort(function (a, b) {
      const aCategory = normalizeString(a.Category || a.category);
      const bCategory = normalizeString(b.Category || b.category);
      const categorySort = aCategory.localeCompare(bCategory);
      if (categorySort !== 0) {
        return categorySort;
      }

      const aProduct = normalizeString(a.Product || a.product);
      const bProduct = normalizeString(b.Product || b.product);
      return aProduct.localeCompare(bProduct);
    });

    return {
      partyName: requestedParty,
      items: items,
      count: items.length
    };
  }

  // Rebuild flow:
  // Scans full RateLogItems, picks latest row per Party+Category+Product key,
  // clears PartyItemLatest data rows, and repopulates index in one batch write.
  function rebuildPartyItemLatestIndex() {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (err) {
      throw appError('WRITE_LOCK_TIMEOUT', 'Could not acquire write lock for rebuild. Please retry.', [
        { detail: err && err.message ? err.message : 'Lock timeout.' }
      ]);
    }

    try {
      const itemSheet = getSheetOrThrow(CONFIG.SHEETS.RATE_LOG_ITEMS);
      const values = getAllValues(itemSheet);
      const stats = {
        scannedRows: 0,
        uniqueKeysWritten: 0,
        skippedInvalidRows: 0
      };

      const latestByKey = {};
      const orderedKeys = [];

      if (values.length > 1) {
        const headers = values[0];
        const map = createNormalizedHeaderMapFromRow_(headers);
        const fallbackMap = createNormalizedHeaderMapFromRow_(CONFIG.WORKBOOK_SHEETS.RateLogItems);

        const idxRefKey = getHeaderIndex_(map, fallbackMap, ['RefKey']);
        const idxParty = getHeaderIndex_(map, fallbackMap, ['PartyName']);
        const idxActionTag = getHeaderIndex_(map, fallbackMap, ['ActionTag']);
        const idxSnapshot = getHeaderIndex_(map, fallbackMap, ['SnapshotDateTime']);
        const idxUserEmail = getHeaderIndex_(map, fallbackMap, ['UserEmail']);
        const idxCategory = getHeaderIndex_(map, fallbackMap, ['Category']);
        const idxProduct = getHeaderIndex_(map, fallbackMap, ['Product']);
        const idxFinalRate = getHeaderIndex_(map, fallbackMap, ['FinalRate']);
        const idxSpecialDiscPct = getHeaderIndex_(map, fallbackMap, ['SpecialDiscPct']);
        const idxGstMode = getHeaderIndex_(map, fallbackMap, ['GSTMode']);
        const idxFreightMode = getHeaderIndex_(map, fallbackMap, ['FreightMode']);
        const idxCdMode = getHeaderIndex_(map, fallbackMap, ['CDMode']);
        const idxCdPercent = getHeaderIndex_(map, fallbackMap, ['CDPercent']);
        const idxLatestListPrice = getHeaderIndex_(map, fallbackMap, ['LatestListPrice']);
        const idxLatestWEF = getHeaderIndex_(map, fallbackMap, ['LatestWEF']);
        const idxBrand = getHeaderIndex_(map, fallbackMap, ['Brand']);
        const idxCreatedAt = getHeaderIndex_(map, fallbackMap, ['CreatedAt']);

        for (let i = 1; i < values.length; i += 1) {
          stats.scannedRows += 1;
          const row = values[i];

          const partyName = normalizeString(readByIdx_(row, idxParty));
          const category = normalizeString(readByIdx_(row, idxCategory));
          const product = normalizeString(readByIdx_(row, idxProduct));
          if (isBlank(partyName) || isBlank(category) || isBlank(product)) {
            stats.skippedInvalidRows += 1;
            continue;
          }

          const timestamp = firstNonBlank_([
            normalizeString(readByIdx_(row, idxSnapshot)),
            normalizeString(readByIdx_(row, idxCreatedAt))
          ]);
          const epoch = toEpoch_(timestamp);
          if (epoch < 0) {
            stats.skippedInvalidRows += 1;
            continue;
          }

          const key = buildLatestKey_(partyName, category, product);
          const candidate = {
            partyName: partyName,
            category: category,
            product: product,
            lastRefKey: normalizeString(readByIdx_(row, idxRefKey)),
            lastActionTag: normalizeString(readByIdx_(row, idxActionTag)),
            lastTimestamp: timestamp,
            lastUserEmail: normalizeString(readByIdx_(row, idxUserEmail)),
            lastFinalRate: round2(toSafeNumber(readByIdx_(row, idxFinalRate), 0)),
            lastSpecialDiscPct: round2(toSafeNumber(readByIdx_(row, idxSpecialDiscPct), 0)),
            lastGSTMode: normalizeString(readByIdx_(row, idxGstMode)),
            lastFreightMode: normalizeString(readByIdx_(row, idxFreightMode)),
            lastCDMode: normalizeString(readByIdx_(row, idxCdMode)),
            lastCDPercent: round2(toSafeNumber(readByIdx_(row, idxCdPercent), 0)),
            lastLatestListPrice: round2(toSafeNumber(readByIdx_(row, idxLatestListPrice), 0)),
            lastLatestWEF: normalizeDateLikeToIsoDay_(readByIdx_(row, idxLatestWEF)),
            lastBrand: normalizeString(readByIdx_(row, idxBrand)),
            _epoch: epoch
          };

          if (!latestByKey[key]) {
            latestByKey[key] = candidate;
            orderedKeys.push(key);
            continue;
          }

          if (candidate._epoch >= latestByKey[key]._epoch) {
            latestByKey[key] = candidate;
          }
        }
      }

      const latestSheet = getSheetOrThrow(CONFIG.SHEETS.PARTY_ITEM_LATEST);
      const latestHeaders = CONFIG.WORKBOOK_SHEETS.PartyItemLatest;
      ensureSheetHeader_(latestSheet, latestHeaders);

      const existingLastRow = latestSheet.getLastRow();
      if (existingLastRow > 1) {
        latestSheet.getRange(2, 1, existingLastRow - 1, latestHeaders.length).clearContent();
      }

      const rows = [];
      for (let j = 0; j < orderedKeys.length; j += 1) {
        const key = orderedKeys[j];
        const entry = latestByKey[key];
        if (!entry) {
          continue;
        }
        rows.push(buildPartyItemLatestRow_(entry, latestHeaders));
      }

      if (rows.length > 0) {
        latestSheet.getRange(2, 1, rows.length, latestHeaders.length).setValues(rows);
      }

      stats.uniqueKeysWritten = rows.length;
      return stats;
    } finally {
      try {
        lock.releaseLock();
      } catch (ignore) {
        // no-op
      }
    }
  }

  function buildPartyItemLatestRow_(entry, headers) {
    const map = createHeaderMap_(headers);
    const row = new Array(headers.length).fill('');

    row[map.PartyName] = normalizeString(entry.partyName);
    row[map.Product] = normalizeString(entry.product);
    row[map.Category] = normalizeString(entry.category);
    row[map.LastRefKey] = normalizeString(entry.lastRefKey);
    row[map.LastActionTag] = normalizeString(entry.lastActionTag);
    row[map.LastTimestamp] = normalizeString(entry.lastTimestamp);
    row[map.LastUserEmail] = normalizeString(entry.lastUserEmail);
    row[map.LastFinalRate] = round2(toSafeNumber(entry.lastFinalRate, 0));
    row[map.LastSpecialDiscPct] = round2(toSafeNumber(entry.lastSpecialDiscPct, 0));
    row[map.LastGSTMode] = normalizeString(entry.lastGSTMode);
    row[map.LastFreightMode] = normalizeString(entry.lastFreightMode);
    row[map.LastCDMode] = normalizeString(entry.lastCDMode);
    row[map.LastCDPercent] = round2(toSafeNumber(entry.lastCDPercent, 0));
    row[map.LastLatestListPrice] = round2(toSafeNumber(entry.lastLatestListPrice, 0));
    row[map.LastLatestWEF] = normalizeDateLikeToIsoDay_(entry.lastLatestWEF);
    row[map.LastBrand] = normalizeString(entry.lastBrand);

    return row;
  }

  function appendRowsToSheet_(sheetName, headers, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return 0;
    }

    const sheet = getSheetOrThrow(sheetName);
    ensureSheetHeader_(sheet, headers);

    for (let i = 0; i < rows.length; i += 1) {
      if (!Array.isArray(rows[i]) || rows[i].length !== headers.length) {
        throw appError('ROW_WIDTH_MISMATCH', 'Row width mismatch while saving sheet: ' + sheetName, [
          { index: i, expected: headers.length, actual: rows[i] ? rows[i].length : 0 }
        ]);
      }
    }

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
    return rows.length;
  }

  function ensureSheetHeader_(sheet, headers) {
    if (!sheet) {
      throw appError('SHEET_REQUIRED', 'Sheet is required.');
    }

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      return;
    }

    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    let matches = true;
    for (let i = 0; i < headers.length; i += 1) {
      if (normalizeString(current[i]) !== normalizeString(headers[i])) {
        matches = false;
        break;
      }
    }

    if (!matches) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }

  function ensureActiveParty_(partyName) {
    if (isBlank(partyName)) {
      throw appError('PARTY_REQUIRED', 'partyName is required.', [
        { field: 'partyName', detail: 'Provide a valid active party.' }
      ]);
    }

    const parties = MasterService.getActiveParties();
    const target = normalizeKey(partyName);

    for (let i = 0; i < parties.length; i += 1) {
      if (normalizeKey(parties[i].partyName) === target) {
        return parties[i].partyName;
      }
    }

    throw appError('PARTY_INACTIVE_OR_MISSING', 'partyName must refer to an active party.', [
      { field: 'partyName', detail: partyName }
    ]);
  }

  function validateActionTag_(actionTag) {
    if (CONFIG.ALL_ALLOWED_ACTION_TAGS.indexOf(actionTag) < 0) {
      throw appError('ACTION_TAG_INVALID', 'Unsupported action tag for save.', [
        { field: 'actionTag', detail: 'Allowed values: ' + CONFIG.ALL_ALLOWED_ACTION_TAGS.join(', ') }
      ]);
    }
  }

  function normalizeActionTag_(value) {
    return normalizeString(value)
      .toUpperCase()
      .replace(/[\s\-]+/g, '_');
  }

  function normalizeSourceMode_(value) {
    const normalized = normalizeString(value)
      .toUpperCase()
      .replace(/[\s\-]+/g, '_');
    return isBlank(normalized) ? CONFIG.SOURCE_MODES.FRESH : normalized;
  }

  function normalizeDateLikeToIsoDay_(value) {
    if (isBlank(value)) {
      return '';
    }
    const dt = toSafeDate(value, null);
    if (!dt) {
      return normalizeString(value);
    }
    return Utilities.formatDate(dt, CONFIG.DEFAULTS.TIMEZONE, 'yyyy-MM-dd');
  }

  function buildLatestKey_(partyName, category, product) {
    return [
      normalizeKey(partyName),
      normalizeKey(category),
      normalizeKey(product)
    ].join('|');
  }

  function createHeaderMap_(headers) {
    const map = {};
    for (let i = 0; i < headers.length; i += 1) {
      map[headers[i]] = i;
    }
    return map;
  }

  function createNormalizedHeaderMapFromRow_(headers) {
    const map = {};
    for (let i = 0; i < headers.length; i += 1) {
      map[normalizeKey(headers[i])] = i;
    }
    return map;
  }

  function getHeaderIndex_(map, fallbackMap, headerNames) {
    const canFallback = fallbackMap && Object.keys(map).length === 0;
    for (let i = 0; i < headerNames.length; i += 1) {
      const key = normalizeKey(headerNames[i]);
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        return map[key];
      }
      if (canFallback && Object.prototype.hasOwnProperty.call(fallbackMap, key)) {
        return fallbackMap[key];
      }
    }
    return -1;
  }

  function readByIdx_(row, idx) {
    if (idx < 0 || idx >= row.length) {
      return '';
    }
    return row[idx];
  }

  function rowToObject_(headers, row) {
    const obj = {};
    for (let i = 0; i < headers.length; i += 1) {
      const key = normalizeString(headers[i]) || ('col' + (i + 1));
      obj[key] = i < row.length ? row[i] : '';
    }
    return obj;
  }

  function maxEpoch_(values) {
    let max = -1;
    for (let i = 0; i < values.length; i += 1) {
      const epoch = toEpoch_(values[i]);
      if (epoch > max) {
        max = epoch;
      }
    }
    return max;
  }

  function toEpoch_(value) {
    const dt = toSafeDate(value, null);
    if (!dt) {
      return -1;
    }
    return dt.getTime();
  }

  function isValidEmail_(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function toBoolean_(value, fallback) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    const text = normalizeString(value).toLowerCase();
    if (['true', '1', 'yes', 'y'].indexOf(text) >= 0) {
      return true;
    }
    if (['false', '0', 'no', 'n'].indexOf(text) >= 0) {
      return false;
    }
    return Boolean(fallback);
  }

  function readAny_(obj, keys) {
    if (!obj || typeof obj !== 'object') {
      return '';
    }

    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        return obj[key];
      }
    }

    const keyMap = {};
    const objKeys = Object.keys(obj);
    for (let j = 0; j < objKeys.length; j += 1) {
      keyMap[normalizeKey(objKeys[j])] = obj[objKeys[j]];
    }

    for (let k = 0; k < keys.length; k += 1) {
      const normalized = normalizeKey(keys[k]);
      if (Object.prototype.hasOwnProperty.call(keyMap, normalized)) {
        return keyMap[normalized];
      }
    }

    return '';
  }

  return {
    info: info,
    error: error,
    appendApiLogRows: appendApiLogRows,
    saveRateBatch: saveRateBatch,
    getPartySnapshots: getPartySnapshots,
    getSnapshotByRef: getSnapshotByRef,
    getAllLatestRates: getAllLatestRates,
    getPartyLatestHistory: getPartyLatestHistory,
    rebuildPartyItemLatestIndex: rebuildPartyItemLatestIndex,
    buildHeaderRow: buildHeaderRow,
    buildItemRows: buildItemRows,
    upsertPartyItemLatest: upsertPartyItemLatest,
    upsertPartyItemBrands: upsertPartyItemBrands,
    getSelectedItemsForAction: getSelectedItemsForAction
  };
})();
