function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toText(value) {
  return String(value ?? '').trim();
}

function normalizeSourceMode(mode) {
  return String(mode || '').toUpperCase() === 'SNAPSHOT' ? 'SNAPSHOT' : 'FRESH';
}

function buildItemPayload(row) {
  const normalized = row.normalized || {};

  return {
    category: toText(row.category),
    product: toText(row.product),
    paymentTerms: toNumber(row.paymentTerms, 0),
    latestListPrice: toNumber(row.sourceListPrice ?? row.latestListPrice, 0),
    latestWEF: toText(row.sourceWEF ?? row.latestWEF),
    previousListPrice: row.previousListPrice === null || row.previousListPrice === undefined || row.previousListPrice === ''
      ? ''
      : toNumber(row.previousListPrice, 0),
    previousWEF: toText(row.previousWEF),
    specialDiscPct: toNumber(normalized.specialDiscPct, 0),
    GSTMode: toText(normalized.gstMode || row.gstMode),
    FreightMode: toText(normalized.freightMode || row.freightMode),
    CDMode: toText(normalized.cdMode || row.cdMode),
    cdPercent: normalized.cdMode === 'PERCENT'
      ? toNumber(normalized.cdPercent, 0)
      : toNumber(normalized.defaultNetCdPercent, 0),
    ownerChecked: Boolean(row.ownerChecked),
    finalActionChecked: Boolean(row.finalActionChecked),
    afterSpecialDiscRate: toNumber(row.calc?.afterSpecialDiscRate, 0),
    netRates: toNumber(row.netRatesCalc?.finalRate, 0)
  };
}

export function buildOwnerApprovalPayload({
  partyName,
  userEmail,
  notes,
  sourceMode,
  selectedRows
}) {
  return {
    partyName: toText(partyName),
    userEmail: toText(userEmail).toLowerCase(),
    notes: toText(notes),
    sourceMode: normalizeSourceMode(sourceMode),
    items: (selectedRows || []).map((row) => buildItemPayload(row))
  };
}

export function buildFinalActionPayload({
  partyName,
  userEmail,
  notes,
  sourceMode,
  actionTag,
  selectedRows
}) {
  return {
    partyName: toText(partyName),
    userEmail: toText(userEmail).toLowerCase(),
    notes: toText(notes),
    sourceMode: normalizeSourceMode(sourceMode),
    actionTag: toText(actionTag).toUpperCase(),
    items: (selectedRows || []).map((row) => buildItemPayload(row))
  };
}

export function buildConfirmationRows(selectedRows = []) {
  return selectedRows.map((row) => {
    const normalized = row.normalized || {};
    const calc = row.calc || {};
    const gst = toText(normalized.gstMode) || '-';
    const freight = toText(normalized.freightMode) || '-';
    const cd = toText(normalized.cdMode) || '-';

    return {
      rowKey: row.rowKey,
      category: toText(row.category),
      product: toText(row.product),
      finalRate: toNumber(calc.finalRate, 0),
      specialDiscPct: toNumber(normalized.specialDiscPct, 0),
      summary: `${gst}/${freight}/${cd}`
    };
  });
}
