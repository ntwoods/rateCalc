const GST_MODES = ['PAID', 'EXTRA'];
const FREIGHT_MODES = ['EXTRA', 'FOR', 'HALF_HALF'];
const CD_MODES = ['NET_RATES', 'PERCENT'];

export function round2(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim().toUpperCase();
  if (allowed.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

export function getGstPercent(paymentTerms, settings = {}) {
  const terms = toNumber(paymentTerms, 0);
  const gst15 = toNumber(settings.GST_15, 18);
  const gst30 = toNumber(settings.GST_30, 7.2);

  if (terms === 15) {
    return round2(gst15);
  }

  if (terms === 30) {
    return round2(gst30);
  }

  return 0;
}

export function normalizeRowInputs(rowInputs = {}, settings = {}) {
  const tdPercent = toNumber(settings.TD_PERCENT, 20);
  const defaultNetCdPercent = toNumber(settings.DEFAULT_NET_CD_PERCENT, 5);

  const specialDiscRaw = String(rowInputs.specialDiscPctInput ?? '').trim();
  const specialDiscNum = specialDiscRaw === '' ? 0 : Number(specialDiscRaw);
  const specialDiscInvalid = !Number.isFinite(specialDiscNum) || specialDiscNum < 0;
  const specialDiscPct = specialDiscInvalid ? 0 : round2(specialDiscNum);

  const gstMode = normalizeEnum(rowInputs.gstMode, GST_MODES, 'EXTRA');
  const freightMode = normalizeEnum(rowInputs.freightMode, FREIGHT_MODES, 'FOR');
  const cdMode = normalizeEnum(rowInputs.cdMode, CD_MODES, 'NET_RATES');

  const cdPercentRaw = String(rowInputs.cdPercentInput ?? '').trim();
  const cdPercentMissing = cdMode === 'PERCENT' && cdPercentRaw === '';
  const cdPercentNum = cdPercentRaw === '' ? null : Number(cdPercentRaw);
  const cdPercentInvalid =
    cdMode === 'PERCENT' &&
    (!Number.isFinite(cdPercentNum) || cdPercentNum < 0);

  const cdPercentTooHigh = cdMode === 'PERCENT' && Number.isFinite(cdPercentNum) && cdPercentNum >= 100;

  const cdPercent = cdMode === 'NET_RATES'
    ? round2(defaultNetCdPercent)
    : (cdPercentMissing || cdPercentInvalid ? null : round2(cdPercentNum));

  return {
    tdPercent: round2(tdPercent),
    defaultNetCdPercent: round2(defaultNetCdPercent),
    specialDiscPct,
    gstMode,
    freightMode,
    cdMode,
    cdPercent,
    ownerChecked: Boolean(rowInputs.ownerChecked),
    finalActionChecked: Boolean(rowInputs.finalActionChecked),
    specialDiscPctInput: specialDiscRaw,
    cdPercentInput: cdPercentRaw,
    specialDiscInvalid,
    cdPercentMissing,
    cdPercentInvalid,
    cdPercentTooHigh
  };
}

export function calculateRowRate(masterRow = {}, normalizedInputs = {}, settings = {}) {
  const latestListPrice = toNumber(masterRow.latestListPrice, 0);
  const paymentTerms = toNumber(masterRow.paymentTerms, 0);

  const tdPercent = toNumber(normalizedInputs.tdPercent, toNumber(settings.TD_PERCENT, 20));
  const specialDiscPct = toNumber(normalizedInputs.specialDiscPct, 0);
  const gstMode = normalizedInputs.gstMode || 'EXTRA';
  const cdMode = normalizedInputs.cdMode || 'NET_RATES';
  const defaultNetCdPercent = toNumber(normalizedInputs.defaultNetCdPercent, toNumber(settings.DEFAULT_NET_CD_PERCENT, 5));

  const tdRate = round2(latestListPrice * (1 - tdPercent / 100));
  const afterSpecialDiscRate = round2(tdRate * (1 - specialDiscPct / 100));

  const gstPercent = getGstPercent(paymentTerms, settings);
  const gstAmount = gstMode === 'PAID'
    ? round2(afterSpecialDiscRate * (gstPercent / 100))
    : 0;

  const appliedCdPercent = cdMode === 'NET_RATES'
    ? round2(defaultNetCdPercent)
    : round2(toNumber(normalizedInputs.cdPercent, 0));

  let cdLessRate = null;
  let netEquivalent = null;
  let finalRate = null;
  let invalidFinalRate = false;

  if (gstMode === 'EXTRA' && cdMode === 'PERCENT') {
    finalRate = round2(afterSpecialDiscRate);
  } else if (gstMode === 'EXTRA' && cdMode === 'NET_RATES') {
    finalRate = round2(afterSpecialDiscRate * (1 - defaultNetCdPercent / 100));
  } else if (gstMode === 'PAID' && cdMode === 'NET_RATES') {
    cdLessRate = round2(afterSpecialDiscRate * (1 - defaultNetCdPercent / 100));
    finalRate = round2(cdLessRate + gstAmount);
  } else if (gstMode === 'PAID' && cdMode === 'PERCENT') {
    const denominator = 1 - appliedCdPercent / 100;
    if (denominator <= 0) {
      invalidFinalRate = true;
    } else {
      cdLessRate = round2(afterSpecialDiscRate * denominator);
      netEquivalent = round2(cdLessRate + gstAmount);
      finalRate = round2(netEquivalent / denominator);
    }
  }

  return {
    latestListPrice: round2(latestListPrice),
    paymentTerms,
    tdPercent: round2(tdPercent),
    tdRate,
    specialDiscPct: round2(specialDiscPct),
    afterSpecialDiscRate,
    gstPercent,
    gstAmount,
    appliedCdPercent,
    cdLessRate,
    netEquivalent,
    finalRate,
    invalidFinalRate
  };
}

export function calculateNetRates(masterRow = {}, normalizedInputs = {}, settings = {}) {
  return calculateRowRate(masterRow, {
    ...normalizedInputs,
    gstMode: 'PAID',
    cdMode: 'NET_RATES'
  }, settings);
}
