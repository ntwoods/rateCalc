var MasterService = (function () {
  // Read-only master data service for settings, parties, products, and workbook meta.
  // Bootstrap payload consumed by frontend on initial load.
  function getBootstrapData() {
    return {
      settings: getSettingsMap(),
      parties: getActiveParties(),
      metadata: {
        appName: CONFIG.APP_NAME,
        version: CONFIG.VERSION,
        timestamp: nowIso()
      },
      version: CONFIG.VERSION
    };
  }

  // Reads settings as a key-value map with lightweight script cache.
  function getSettingsMap() {
    const cacheKey = 'master_settings_map_v1';
    const cached = getCachedJson_(cacheKey);
    if (cached) {
      return cached;
    }

    const sheet = getSheetOrThrow(CONFIG.SHEETS.SETTINGS);
    const values = getAllValues(sheet);
    if (values.length <= 1) {
      putCachedJson_(cacheKey, {});
      return {};
    }

    const headers = values[0];
    const keyIdx = findHeaderIndex_(headers, 'Key');
    const valueIdx = findHeaderIndex_(headers, 'Value');
    if (keyIdx < 0 || valueIdx < 0) {
      throw appError('SETTINGS_HEADERS_INVALID', 'Settings sheet must include Key and Value headers.');
    }

    const map = {};
    for (let i = 1; i < values.length; i += 1) {
      const row = values[i];
      const key = normalizeString(row[keyIdx]);
      if (isBlank(key)) {
        continue;
      }
      map[key] = coerceSettingValue_(row[valueIdx]);
    }

    putCachedJson_(cacheKey, map);
    return map;
  }

  // Active parties sorted for deterministic dropdown rendering.
  function getActiveParties() {
    const cacheKey = 'master_active_parties_v1';
    const cached = getCachedJson_(cacheKey);
    if (cached) {
      return cached;
    }

    const sheet = getSheetOrThrow(CONFIG.SHEETS.PARTIES);
    const values = getAllValues(sheet);
    if (values.length <= 1) {
      putCachedJson_(cacheKey, []);
      return [];
    }

    const headers = values[0];
    const partyNameIdx = findHeaderIndex_(headers, 'PartyName');
    const activeIdx = findHeaderIndex_(headers, 'Active');
    const sortOrderIdx = findHeaderIndex_(headers, 'SortOrder');
    const notesIdx = findHeaderIndex_(headers, 'Notes');

    if (partyNameIdx < 0 || activeIdx < 0) {
      throw appError('PARTIES_HEADERS_INVALID', 'Parties sheet must include PartyName and Active headers.');
    }

    const parties = [];
    for (let i = 1; i < values.length; i += 1) {
      const row = values[i];
      const partyName = normalizeString(row[partyNameIdx]);
      if (isBlank(partyName)) {
        continue;
      }

      const active = toBoolean_(row[activeIdx], false);
      if (!active) {
        continue;
      }

      const sortOrderValue = sortOrderIdx >= 0 ? toSafeNumber(row[sortOrderIdx], null) : null;
      parties.push({
        partyName: partyName,
        active: true,
        sortOrder: sortOrderValue === null ? 999999 : sortOrderValue,
        notes: notesIdx >= 0 ? normalizeString(row[notesIdx]) : ''
      });
    }

    parties.sort(function (a, b) {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.partyName.localeCompare(b.partyName);
    });

    putCachedJson_(cacheKey, parties);
    return parties;
  }

  // Product master is derived from a wide ListPrice table in one in-memory pass.
  function getProductMaster(params) {
    const safeParams = params || {};
    const search = normalizeString(safeParams.search);
    const category = normalizeString(safeParams.category);

    const cacheKey = 'master_products_v1|s=' + normalizeKey(search) + '|c=' + normalizeKey(category);
    const cached = getCachedJson_(cacheKey);
    if (cached) {
      return cached;
    }

    const sheet = getSheetOrThrow(CONFIG.SHEETS.LIST_PRICE);
    const values = getAllValues(sheet);
    if (values.length <= 1) {
      const emptyResult = {
        products: [],
        stats: {
          totalRowsScanned: 0,
          validProductsReturned: 0,
          invalidRowsSkipped: 0
        }
      };
      putCachedJson_(cacheKey, emptyResult);
      return emptyResult;
    }

    const headers = values[0];
    const headerMeta = buildListPriceHeaderMeta_(headers);
    validateListPriceHeaderMeta_(headerMeta);

    const products = [];
    const stats = {
      totalRowsScanned: 0,
      validProductsReturned: 0,
      invalidRowsSkipped: 0
    };

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i];
      stats.totalRowsScanned += 1;

      const parsed = parseListPriceRow(row, headerMeta);
      if (!parsed.valid) {
        stats.invalidRowsSkipped += 1;
        continue;
      }

      if (!matchesCategoryFilter_(parsed.product.category, category)) {
        continue;
      }

      if (!containsInsensitive_(parsed.product.product, search)) {
        continue;
      }

      products.push(parsed.product);
    }

    products.sort(function (a, b) {
      const categorySort = a.category.localeCompare(b.category);
      if (categorySort !== 0) {
        return categorySort;
      }
      const productSort = a.product.localeCompare(b.product);
      if (productSort !== 0) {
        return productSort;
      }
      return a.paymentTerms - b.paymentTerms;
    });

    stats.validProductsReturned = products.length;

    const result = {
      products: products,
      stats: stats
    };
    putCachedJson_(cacheKey, result);
    return result;
  }

  // Parses one ListPrice row into normalized product snapshot fields.
  function parseListPriceRow(row, headers) {
    const meta = isListPriceHeaderMeta_(headers) ? headers : buildListPriceHeaderMeta_(headers);
    const category = normalizeString(row[meta.categoryIdx]);
    const product = normalizeString(row[meta.productIdx]);

    if (isBlank(category) || isBlank(product)) {
      return { valid: false, reason: 'blank_category_or_product' };
    }

    const paymentTerms = toSafeNumber(row[meta.paymentTermsIdx], null);
    if (CONFIG.ENUMS.PAYMENT_TERMS.indexOf(paymentTerms) < 0) {
      return { valid: false, reason: 'invalid_payment_terms' };
    }

    const historyEntries = extractPriceHistoryFromRow(row, meta);
    const picked = pickLatestAndPrevious(historyEntries);
    if (!picked.latest) {
      return { valid: false, reason: 'no_valid_price_history' };
    }

    return {
      valid: true,
      product: {
        category: category,
        product: product,
        paymentTerms: paymentTerms,
        latestListPrice: round2(picked.latest.listPrice),
        latestWEF: picked.latest.wef,
        previousListPrice: picked.previous ? round2(picked.previous.listPrice) : null,
        previousWEF: picked.previous ? picked.previous.wef : null
      }
    };
  }

  // Extracts valid ListPrice/WEF pairs from variable-width ListPrice row.
  function extractPriceHistoryFromRow(row, headers) {
    const meta = isListPriceHeaderMeta_(headers) ? headers : buildListPriceHeaderMeta_(headers);
    const entries = [];

    for (let i = 0; i < meta.pairs.length; i += 1) {
      const pair = meta.pairs[i];
      const price = toSafeNumber(row[pair.priceIdx], null);
      const wefDate = toSafeDate(row[pair.wefIdx], null);
      if (price === null || !wefDate) {
        continue;
      }

      entries.push({
        listPrice: round2(price),
        wefDate: wefDate,
        wefEpoch: wefDate.getTime(),
        wef: formatDateToIsoDay_(wefDate)
      });
    }

    return entries;
  }

  // Chooses latest and previous entries by descending WEF.
  function pickLatestAndPrevious(historyEntries) {
    if (!Array.isArray(historyEntries) || historyEntries.length === 0) {
      return { latest: null, previous: null };
    }

    const sorted = historyEntries
      .filter(function (entry) {
        return entry && typeof entry.wefEpoch === 'number' && !Number.isNaN(entry.wefEpoch);
      })
      .sort(function (a, b) {
        return b.wefEpoch - a.wefEpoch;
      });

    if (sorted.length === 0) {
      return { latest: null, previous: null };
    }

    return {
      latest: {
        listPrice: sorted[0].listPrice,
        wef: sorted[0].wef
      },
      previous: sorted.length > 1 ? {
        listPrice: sorted[1].listPrice,
        wef: sorted[1].wef
      } : null
    };
  }

  function getWorkbookMeta() {
    const ss = getSpreadsheet();
    const sheets = ss.getSheets();
    const sheetMeta = [];

    for (let i = 0; i < sheets.length; i += 1) {
      const sh = sheets[i];
      sheetMeta.push({
        name: sh.getName(),
        lastRow: sh.getLastRow(),
        lastColumn: sh.getLastColumn(),
        maxRows: sh.getMaxRows(),
        maxColumns: sh.getMaxColumns()
      });
    }

    return {
      appName: CONFIG.APP_NAME,
      version: CONFIG.VERSION,
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      spreadsheetName: ss.getName(),
      timezone: ss.getSpreadsheetTimeZone(),
      sheetCount: sheets.length,
      sheets: sheetMeta,
      requiredSheets: Object.keys(CONFIG.WORKBOOK_SHEETS),
      timestamp: nowIso()
    };
  }

  function getHealthReport() {
    // Health endpoint is intentionally lightweight and safe to call frequently.
    const spreadsheet = getSpreadsheetConnectivity_();
    const status = spreadsheet.connected ? 'ok' : 'degraded';

    return {
      app: CONFIG.APP_NAME,
      status: status,
      timestamp: nowIso(),
      version: CONFIG.VERSION,
      spreadsheet: spreadsheet
    };
  }

  function getSpreadsheetConnectivity_() {
    const result = {
      configured: false,
      connected: false,
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      spreadsheetName: null,
      sheetCount: 0,
      error: null
    };

    if (isBlank(CONFIG.SPREADSHEET_ID) || CONFIG.SPREADSHEET_ID === CONFIG.PLACEHOLDER_SPREADSHEET_ID) {
      result.error = 'Spreadsheet ID is not configured.';
      return result;
    }

    result.configured = true;
    try {
      const ss = getSpreadsheet();
      result.connected = true;
      result.spreadsheetName = ss.getName();
      result.sheetCount = ss.getSheets().length;
      return result;
    } catch (err) {
      result.error = err && err.message ? err.message : 'Unable to connect to spreadsheet.';
      return result;
    }
  }

  function buildListPriceHeaderMeta_(headers) {
    // ListPrice is a wide sheet. Detect dynamic ListPriceN/WEFN pairs by suffix.
    const safeHeaders = Array.isArray(headers) ? headers : [];
    const pairsBySuffix = {};
    const pairs = [];

    for (let i = 0; i < safeHeaders.length; i += 1) {
      const key = normalizeKey(safeHeaders[i]);
      const priceMatch = key.match(/^listprice(\d*)$/);
      const wefMatch = key.match(/^wef(\d*)$/);

      if (priceMatch) {
        const suffix = priceMatch[1] || '1';
        pairsBySuffix[suffix] = pairsBySuffix[suffix] || {};
        pairsBySuffix[suffix].priceIdx = i;
      }
      if (wefMatch) {
        const suffix = wefMatch[1] || '1';
        pairsBySuffix[suffix] = pairsBySuffix[suffix] || {};
        pairsBySuffix[suffix].wefIdx = i;
      }
    }

    const suffixes = Object.keys(pairsBySuffix).sort(function (a, b) {
      return Number(a) - Number(b);
    });

    for (let j = 0; j < suffixes.length; j += 1) {
      const entry = pairsBySuffix[suffixes[j]];
      if (entry.priceIdx !== undefined && entry.wefIdx !== undefined) {
        pairs.push({
          priceIdx: entry.priceIdx,
          wefIdx: entry.wefIdx
        });
      }
    }

    return {
      __isListPriceHeaderMeta: true,
      headers: safeHeaders,
      categoryIdx: findHeaderIndex_(safeHeaders, 'Category'),
      productIdx: findHeaderIndex_(safeHeaders, 'Product'),
      paymentTermsIdx: findHeaderIndex_(safeHeaders, 'PaymentTerms'),
      pairs: pairs
    };
  }

  function validateListPriceHeaderMeta_(meta) {
    if (meta.categoryIdx < 0 || meta.productIdx < 0 || meta.paymentTermsIdx < 0) {
      throw appError('LISTPRICE_HEADERS_INVALID', 'ListPrice sheet must include Category, Product, PaymentTerms.');
    }
    if (!meta.pairs || meta.pairs.length === 0) {
      throw appError('LISTPRICE_HEADERS_INVALID', 'ListPrice sheet must include at least one ListPrice/WEF pair.');
    }
  }

  function findHeaderIndex_(headers, headerName) {
    const target = normalizeKey(headerName);
    for (let i = 0; i < headers.length; i += 1) {
      if (normalizeKey(headers[i]) === target) {
        return i;
      }
    }
    return -1;
  }

  function isListPriceHeaderMeta_(value) {
    return Boolean(value && value.__isListPriceHeaderMeta);
  }

  function toBoolean_(value, fallback) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }

    const normalized = normalizeString(value).toLowerCase();
    if (['true', '1', 'yes', 'y'].indexOf(normalized) >= 0) {
      return true;
    }
    if (['false', '0', 'no', 'n'].indexOf(normalized) >= 0) {
      return false;
    }
    return Boolean(fallback);
  }

  function coerceSettingValue_(value) {
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    const text = normalizeString(value);
    if (isBlank(text)) {
      return '';
    }

    const lower = text.toLowerCase();
    if (lower === 'true') {
      return true;
    }
    if (lower === 'false') {
      return false;
    }

    if (/^-?\d+(\.\d+)?$/.test(text)) {
      return Number(text);
    }

    return text;
  }

  function matchesCategoryFilter_(category, filter) {
    if (isBlank(filter)) {
      return true;
    }
    return normalizeKey(category) === normalizeKey(filter);
  }

  function containsInsensitive_(text, query) {
    if (isBlank(query)) {
      return true;
    }
    return normalizeString(text).toLowerCase().indexOf(normalizeString(query).toLowerCase()) >= 0;
  }

  function formatDateToIsoDay_(date) {
    return Utilities.formatDate(date, CONFIG.DEFAULTS.TIMEZONE, 'yyyy-MM-dd');
  }

  function getCachedJson_(key) {
    try {
      const cache = CacheService.getScriptCache();
      const raw = cache.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function putCachedJson_(key, value) {
    try {
      const cache = CacheService.getScriptCache();
      cache.put(key, JSON.stringify(value), CONFIG.DEFAULTS.MASTER_CACHE_TTL_SECONDS);
    } catch (err) {
      // Cache failures should never block master data reads.
    }
  }

  return {
    getBootstrapData: getBootstrapData,
    getSettingsMap: getSettingsMap,
    getActiveParties: getActiveParties,
    getProductMaster: getProductMaster,
    parseListPriceRow: parseListPriceRow,
    extractPriceHistoryFromRow: extractPriceHistoryFromRow,
    pickLatestAndPrevious: pickLatestAndPrevious,
    getWorkbookMeta: getWorkbookMeta,
    getHealthReport: getHealthReport
  };
})();
