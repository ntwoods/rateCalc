var CalcService = (function () {
  // Pure calculation layer. No spreadsheet I/O should happen in this service.
  const GST_MODE_ALLOWED = CONFIG.ENUMS.GST_MODES;
  const FREIGHT_MODE_ALLOWED = CONFIG.ENUMS.FREIGHT_MODES;
  const CD_MODE_ALLOWED = CONFIG.ENUMS.CD_MODES;
  const PAYMENT_TERMS_ALLOWED = CONFIG.ENUMS.PAYMENT_TERMS;
  const GST_MODE_PAID = CONFIG.ENUM_VALUES.GST_MODE_PAID;
  const GST_MODE_EXTRA = CONFIG.ENUM_VALUES.GST_MODE_EXTRA;
  const CD_MODE_NET_RATES = CONFIG.ENUM_VALUES.CD_MODE_NET_RATES;
  const CD_MODE_PERCENT = CONFIG.ENUM_VALUES.CD_MODE_PERCENT;

  function calculateItemRate(input, settings) {
    const normalizedInput = normalizeEnums(input || {});
    const validation = validateRateInput(normalizedInput);
    if (!validation.ok) {
      throw appError('RATE_INPUT_INVALID', 'Invalid calculation input.', validation.errors);
    }

    const normalizedSettings = normalizeSettings_(settings || {});
    const latestListPrice = validation.input.latestListPrice;
    const paymentTerms = validation.input.paymentTerms;
    const specialDiscPct = validation.input.specialDiscPct;
    const gstMode = validation.input.gstMode;
    const freightMode = validation.input.freightMode;
    const cdMode = validation.input.cdMode;

    const tdPercent = normalizedSettings.tdPercent;
    const tdRate = round2(latestListPrice * (1 - tdPercent / 100));
    const afterSpecialDiscRate = round2(tdRate * (1 - specialDiscPct / 100));

    const gstPercent = getGstPercent(paymentTerms, normalizedSettings);
    const gstAmount = gstMode === GST_MODE_PAID
      ? round2(afterSpecialDiscRate * (gstPercent / 100))
      : 0;

    const appliedCdPercent = cdMode === CD_MODE_NET_RATES
      ? normalizedSettings.defaultNetCdPercent
      : validation.input.cdPercent;

    let finalRate = afterSpecialDiscRate;
    let cdLessRate = null;
    let netEquivalent = null;

    if (gstMode === GST_MODE_EXTRA && cdMode === CD_MODE_PERCENT) {
      finalRate = afterSpecialDiscRate;
    } else if (gstMode === GST_MODE_EXTRA && cdMode === CD_MODE_NET_RATES) {
      const denominator = 1 - appliedCdPercent / 100;
      if (denominator <= 0) {
        throw appError('CD_PERCENT_INVALID', 'Applied CD percent must be less than 100 for NET_RATES.', [
          { field: 'appliedCdPercent', detail: String(appliedCdPercent) }
        ]);
      }
      finalRate = round2(afterSpecialDiscRate * denominator);
    } else if (gstMode === GST_MODE_PAID && cdMode === CD_MODE_NET_RATES) {
      const denominator = 1 - appliedCdPercent / 100;
      if (denominator <= 0) {
        throw appError('CD_PERCENT_INVALID', 'Applied CD percent must be less than 100 for NET_RATES.', [
          { field: 'appliedCdPercent', detail: String(appliedCdPercent) }
        ]);
      }
      cdLessRate = round2(afterSpecialDiscRate * denominator);
      finalRate = round2(cdLessRate + gstAmount);
    } else if (gstMode === GST_MODE_PAID && cdMode === CD_MODE_PERCENT) {
      const denominator = 1 - appliedCdPercent / 100;
      if (denominator <= 0) {
        throw appError('CD_PERCENT_INVALID', 'cdPercent must be less than 100 for PAID + PERCENT mode.', [
          { field: 'cdPercent', detail: String(appliedCdPercent) }
        ]);
      }
      cdLessRate = round2(afterSpecialDiscRate * denominator);
      netEquivalent = round2(cdLessRate + gstAmount);
      finalRate = round2(netEquivalent / denominator);
    }

    return {
      tdPercent: round2(tdPercent),
      tdRate: tdRate,
      specialDiscPct: round2(specialDiscPct),
      afterSpecialDiscRate: afterSpecialDiscRate,
      gstPercent: gstPercent,
      gstAmount: gstAmount,
      appliedCdPercent: round2(appliedCdPercent),
      finalRate: round2(finalRate),
      gstMode: gstMode,
      freightMode: freightMode,
      cdMode: cdMode,
      latestListPrice: round2(latestListPrice),
      paymentTerms: paymentTerms,
      cdLessRate: cdLessRate,
      netEquivalent: netEquivalent
    };
  }

  function getGstPercent(paymentTerms, settings) {
    const normalizedSettings = normalizeSettings_(settings || {});
    const terms = toSafeNumber(paymentTerms, null);
    if (terms === PAYMENT_TERMS_ALLOWED[0]) {
      return round2(normalizedSettings.gst15);
    }
    if (terms === PAYMENT_TERMS_ALLOWED[1]) {
      return round2(normalizedSettings.gst30);
    }
    return 0;
  }

  function validateRateInput(input) {
    const errors = [];
    const normalizedInput = normalizeEnums(input || {});

    const latestListPrice = toSafeNumber(readAny_(normalizedInput, ['latestListPrice', 'latestlistprice']), null);
    if (latestListPrice === null) {
      errors.push({ field: 'latestListPrice', detail: 'latestListPrice must be numeric.' });
    }

    const paymentTerms = toSafeNumber(readAny_(normalizedInput, ['paymentTerms', 'paymentterms']), null);
    if (PAYMENT_TERMS_ALLOWED.indexOf(paymentTerms) < 0) {
      errors.push({ field: 'paymentTerms', detail: 'paymentTerms must be 15 or 30.' });
    }

    const specialDiscPct = toSafeNumber(readAny_(normalizedInput, ['specialDiscPct', 'specialdiscpct']), null);
    if (specialDiscPct === null || specialDiscPct < 0) {
      errors.push({ field: 'specialDiscPct', detail: 'specialDiscPct must be numeric and >= 0.' });
    }

    const gstMode = readAny_(normalizedInput, ['gstMode', 'GSTMode']);
    if (GST_MODE_ALLOWED.indexOf(gstMode) < 0) {
      errors.push({ field: 'GSTMode', detail: 'GSTMode must be one of: ' + GST_MODE_ALLOWED.join(', ') });
    }

    const freightMode = readAny_(normalizedInput, ['freightMode', 'FreightMode']);
    if (FREIGHT_MODE_ALLOWED.indexOf(freightMode) < 0) {
      errors.push({ field: 'FreightMode', detail: 'FreightMode must be one of: ' + FREIGHT_MODE_ALLOWED.join(', ') });
    }

    const cdMode = readAny_(normalizedInput, ['cdMode', 'CDMode']);
    if (CD_MODE_ALLOWED.indexOf(cdMode) < 0) {
      errors.push({ field: 'CDMode', detail: 'CDMode must be one of: ' + CD_MODE_ALLOWED.join(', ') });
    }

    let cdPercent = null;
    if (cdMode === CD_MODE_PERCENT) {
      cdPercent = toSafeNumber(readAny_(normalizedInput, ['cdPercent', 'cdpercent']), null);
      if (cdPercent === null || cdPercent < 0) {
        errors.push({ field: 'cdPercent', detail: 'cdPercent must be numeric and >= 0 when CDMode=PERCENT.' });
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      input: {
        latestListPrice: latestListPrice,
        paymentTerms: paymentTerms,
        specialDiscPct: specialDiscPct,
        gstMode: gstMode,
        freightMode: freightMode,
        cdMode: cdMode,
        cdPercent: cdPercent
      }
    };
  }

  function normalizeEnums(input) {
    const raw = input || {};
    const normalized = Object.assign({}, raw);

    normalized.gstMode = normalizeEnumValue_(readAny_(raw, ['gstMode', 'GSTMode']));
    normalized.GSTMode = normalized.gstMode;

    normalized.freightMode = normalizeEnumValue_(readAny_(raw, ['freightMode', 'FreightMode']));
    normalized.FreightMode = normalized.freightMode;

    normalized.cdMode = normalizeEnumValue_(readAny_(raw, ['cdMode', 'CDMode']));
    normalized.CDMode = normalized.cdMode;

    return normalized;
  }

  function validateCategoryDiscountConsistency(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return {
        ok: true,
        errors: []
      };
    }

    const errors = [];
    const categoryDiscountMap = {};

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] || {};
      const category = normalizeKey(readAny_(item, ['category', 'Category']));
      if (isBlank(category)) {
        continue;
      }

      const specialDiscPct = toSafeNumber(readAny_(item, ['specialDiscPct', 'specialdiscpct']), null);
      if (specialDiscPct === null || specialDiscPct < 0) {
        errors.push({
          index: i,
          field: 'specialDiscPct',
          detail: 'specialDiscPct must be numeric and >= 0 for category consistency check.'
        });
        continue;
      }

      const roundedPct = round2(specialDiscPct);
      if (categoryDiscountMap[category] === undefined) {
        categoryDiscountMap[category] = roundedPct;
        continue;
      }

      if (categoryDiscountMap[category] !== roundedPct) {
        errors.push({
          index: i,
          field: 'specialDiscPct',
          detail: 'Category "' + category + '" has inconsistent specialDiscPct values.'
        });
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      categoryDiscountMap: categoryDiscountMap
    };
  }

  function roundMoney(value) {
    return round2(toSafeNumber(value, 0));
  }

  function percentOf(base, percent) {
    const safeBase = toSafeNumber(base, 0);
    const safePercent = toSafeNumber(percent, 0);
    return round2((safeBase * safePercent) / 100);
  }

  function normalizeSettings_(settings) {
    const safe = settings || {};
    return {
      tdPercent: toSafeNumber(readAny_(safe, ['TD_PERCENT', 'tdPercent']), 20),
      defaultNetCdPercent: toSafeNumber(readAny_(safe, ['DEFAULT_NET_CD_PERCENT', 'defaultNetCdPercent']), 5),
      gst15: toSafeNumber(readAny_(safe, ['GST_15', 'gst15']), 18),
      gst30: toSafeNumber(readAny_(safe, ['GST_30', 'gst30']), 7.2)
    };
  }

  function normalizeEnumValue_(value) {
    return normalizeString(value)
      .toUpperCase()
      .replace(/[\s\-]+/g, '_');
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

    const normalizedMap = {};
    const objKeys = Object.keys(obj);
    for (let j = 0; j < objKeys.length; j += 1) {
      normalizedMap[normalizeKey(objKeys[j])] = obj[objKeys[j]];
    }

    for (let k = 0; k < keys.length; k += 1) {
      const normalizedKey = normalizeKey(keys[k]);
      if (Object.prototype.hasOwnProperty.call(normalizedMap, normalizedKey)) {
        return normalizedMap[normalizedKey];
      }
    }

    return '';
  }

  return {
    calculateItemRate: calculateItemRate,
    getGstPercent: getGstPercent,
    validateRateInput: validateRateInput,
    normalizeEnums: normalizeEnums,
    validateCategoryDiscountConsistency: validateCategoryDiscountConsistency,
    roundMoney: roundMoney,
    percentOf: percentOf
  };
})();
