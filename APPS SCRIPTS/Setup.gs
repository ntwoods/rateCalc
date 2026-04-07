var SetupService = (function () {
  // Idempotent workbook setup service for initial and repeatable provisioning.
  function setupWorkbook() {
    const summary = {
      status: 'ok',
      timestamp: nowIso(),
      createdSheets: [],
      alreadyPresentSheets: [],
      headerUpdatedSheets: [],
      seedsInserted: {
        settingsKeys: [],
        partiesRows: 0,
        listPriceRows: 0
      },
      validationsApplied: []
    };

    const sheetNames = Object.keys(CONFIG.WORKBOOK_SHEETS);
    for (let i = 0; i < sheetNames.length; i += 1) {
      const sheetName = sheetNames[i];
      const headers = CONFIG.WORKBOOK_SHEETS[sheetName];
      const result = ensureSheet(sheetName, headers);

      if (result.created) {
        summary.createdSheets.push(sheetName);
      } else {
        summary.alreadyPresentSheets.push(sheetName);
      }
      if (result.headerUpdated) {
        summary.headerUpdatedSheets.push(sheetName);
      }
    }

    const settingsSeed = seedSettingsIfEmpty();
    summary.seedsInserted.settingsKeys = settingsSeed.insertedKeys;

    const partySeed = seedPartiesIfBlank_();
    summary.seedsInserted.partiesRows = partySeed.insertedRows;

    const listPriceSeed = seedListPriceIfBlank_();
    summary.seedsInserted.listPriceRows = listPriceSeed.insertedRows;

    summary.validationsApplied = applyValidations();
    return summary;
  }

  function bootstrap() {
    return setupWorkbook();
  }

  return {
    setupWorkbook: setupWorkbook,
    bootstrap: bootstrap
  };
})();

function setupWorkbook() {
  return SetupService.setupWorkbook();
}

function ensureSheet(name, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  let created = false;

  if (!sheet) {
    sheet = ss.insertSheet(name);
    created = true;
  }

  const headerUpdated = ensureHeaderRow(sheet, headers);
  applySheetFormatting(sheet);

  return {
    sheet: sheet,
    created: created,
    headerUpdated: headerUpdated
  };
}

function ensureHeaderRow(sheet, headers) {
  if (!sheet || !Array.isArray(headers) || headers.length === 0) {
    return false;
  }

  const currentHeaders = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, headers.length).getValues()[0]
    : [];

  let matches = currentHeaders.length >= headers.length;
  for (let i = 0; i < headers.length && matches; i += 1) {
    if (normalizeString(currentHeaders[i]) !== normalizeString(headers[i])) {
      matches = false;
    }
  }

  if (!matches) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  return !matches;
}

function seedSettingsIfEmpty() {
  const sheet = getSheetOrThrow(CONFIG.SHEETS.SETTINGS);
  const insertedRows = [];
  const existingKeys = {};
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    const keyValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keyValues.length; i += 1) {
      const key = normalizeKey(keyValues[i][0]);
      if (!isBlank(key)) {
        existingKeys[key] = true;
      }
    }
  }

  for (let i = 0; i < CONFIG.SETTINGS_DEFAULTS.length; i += 1) {
    const row = CONFIG.SETTINGS_DEFAULTS[i];
    const key = normalizeKey(row.key);
    if (!existingKeys[key]) {
      insertedRows.push([row.key, row.value, row.notes]);
      existingKeys[key] = true;
    }
  }

  if (insertedRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, insertedRows.length, 3).setValues(insertedRows);
  }

  return {
    insertedRows: insertedRows.length,
    insertedKeys: insertedRows.map(function (row) { return row[0]; })
  };
}

function applySheetFormatting(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol <= 0) {
    return;
  }

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange
    .setBackground('#E8EEF7')
    .setFontWeight('bold')
    .setFontColor('#1F2937')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, Math.min(lastCol, 20));
}

function applyValidations() {
  const applied = [];

  const listPriceSheet = getSheetOrThrow(CONFIG.SHEETS.LIST_PRICE);
  const partiesSheet = getSheetOrThrow(CONFIG.SHEETS.PARTIES);
  const usersSheet = getSheetOrThrow(CONFIG.SHEETS.USERS);

  const paymentTermsAsText = CONFIG.ENUMS.PAYMENT_TERMS.map(function (v) { return String(v); });
  applyListValidation_(listPriceSheet, 'PaymentTerms', paymentTermsAsText, applied);
  applyCheckboxValidation_(partiesSheet, 'Active', applied);
  applyCheckboxValidation_(usersSheet, 'Active', applied);

  return applied;
}

function seedPartiesIfBlank_() {
  const sheet = getSheetOrThrow(CONFIG.SHEETS.PARTIES);
  const isBlankData = sheet.getLastRow() <= 1;

  if (!isBlankData) {
    return { insertedRows: 0 };
  }

  const rows = CONFIG.SAMPLE_DATA.Parties.map(function (row) { return row.slice(); });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  return { insertedRows: rows.length };
}

function seedListPriceIfBlank_() {
  const sheet = getSheetOrThrow(CONFIG.SHEETS.LIST_PRICE);
  const isBlankData = sheet.getLastRow() <= 1;

  if (!isBlankData) {
    return { insertedRows: 0 };
  }

  const rows = CONFIG.SAMPLE_DATA.ListPrice.map(function (row) { return row.slice(); });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  return { insertedRows: rows.length };
}

function applyListValidation_(sheet, headerName, allowedValues, out) {
  const column = findHeaderColumn_(sheet, headerName);
  if (column < 1) {
    return;
  }

  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  const range = sheet.getRange(2, column, rowCount, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(allowedValues, true)
    .setAllowInvalid(false)
    .build();

  range.setDataValidation(rule);
  out.push({
    sheet: sheet.getName(),
    column: headerName,
    rule: 'value_in_list(' + allowedValues.join(',') + ')'
  });
}

function applyCheckboxValidation_(sheet, headerName, out) {
  const column = findHeaderColumn_(sheet, headerName);
  if (column < 1) {
    return;
  }

  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  const range = sheet.getRange(2, column, rowCount, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .setAllowInvalid(false)
    .build();

  range.setDataValidation(rule);
  out.push({
    sheet: sheet.getName(),
    column: headerName,
    rule: 'checkbox_true_false'
  });
}

function findHeaderColumn_(sheet, headerName) {
  const lastCol = sheet.getLastColumn();
  if (lastCol <= 0) {
    return -1;
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const target = normalizeKey(headerName);

  for (let i = 0; i < headers.length; i += 1) {
    if (normalizeKey(headers[i]) === target) {
      return i + 1;
    }
  }
  return -1;
}
