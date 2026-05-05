import * as XLSX from 'xlsx';
import { calculateNetRates, calculateRowRate, round2 } from './calcEngine';
import { makeRowKey } from './keys';

const OWNER_APPROVED_TAG = 'OWNER_APPROVED';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeTag(value) {
  return normalizeText(value).toUpperCase().replace(/[\s-]+/g, '_');
}

function toFiniteNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizeFilePart(value) {
  const safe = normalizeText(value).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return safe || 'AllParties';
}

function timestampForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function hasApprovedSavedState(item) {
  return normalizeTag(item?.actionTag) === OWNER_APPROVED_TAG || Boolean(item?.ownerChecked);
}

function resolveCalculatedValues({ product, snapshotItem, settings }) {
  const latestListPrice = toFiniteNumber(snapshotItem?.latestListPrice ?? product?.latestListPrice, null);
  const paymentTerms = toFiniteNumber(snapshotItem?.paymentTerms ?? product?.paymentTerms, 0);
  const specialDiscPct = toFiniteNumber(snapshotItem?.specialDiscPct, 0);
  const gstMode = normalizeText(snapshotItem?.gstMode || 'EXTRA').toUpperCase();
  const freightMode = normalizeText(snapshotItem?.freightMode || 'FOR').toUpperCase();
  const cdMode = normalizeText(snapshotItem?.cdMode || 'NET_RATES').toUpperCase();
  const cdPercent = toFiniteNumber(snapshotItem?.cdPercent, settings?.DEFAULT_NET_CD_PERCENT ?? 5);

  if (latestListPrice === null) {
    return {
      afterSpecialDiscRate: toFiniteNumber(snapshotItem?.afterSpecialDiscRate, null),
      netRates: toFiniteNumber(snapshotItem?.netRates ?? snapshotItem?.finalRate, null)
    };
  }

  const normalized = {
    tdPercent: toFiniteNumber(settings?.TD_PERCENT, 20),
    defaultNetCdPercent: toFiniteNumber(settings?.DEFAULT_NET_CD_PERCENT, 5),
    specialDiscPct,
    gstMode,
    freightMode,
    cdMode,
    cdPercent
  };
  const calc = calculateRowRate({ latestListPrice, paymentTerms }, normalized, settings);
  const netRatesCalc = calculateNetRates({ latestListPrice, paymentTerms }, normalized, settings);

  return {
    afterSpecialDiscRate: toFiniteNumber(snapshotItem?.afterSpecialDiscRate, calc.afterSpecialDiscRate),
    netRates: toFiniteNumber(snapshotItem?.netRates, netRatesCalc.finalRate)
  };
}

function setSheetLayout(sheet, widths) {
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!sheet[addr]) {
      continue;
    }
    sheet[addr].s = {
      font: { bold: true },
      alignment: { horizontal: 'center' }
    };
  }
  for (let r = 1; r <= range.e.r; r += 1) {
    for (let c = 0; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (sheet[addr]?.t === 'n') {
        sheet[addr].z = '0.00';
      }
    }
  }
}

export function buildOwnerApprovedExportRows({
  displayedProducts = [],
  activeSnapshotMap = {},
  getRowKey,
  settings = {}
}) {
  const extraRows = [];
  const paidRows = [];
  const parties = new Set();

  displayedProducts.forEach((product) => {
    const rowKey = typeof getRowKey === 'function'
      ? getRowKey(product)
      : product?.rowKey || makeRowKey(product?.category, product?.product);
    const snapshotItem = activeSnapshotMap[rowKey] || null;
    if (!snapshotItem || !hasApprovedSavedState(snapshotItem)) {
      return;
    }

    const partyName = normalizeText(snapshotItem.partyName || product?.partyName);
    if (partyName) {
      parties.add(partyName);
    }

    const { afterSpecialDiscRate, netRates } = resolveCalculatedValues({
      product,
      snapshotItem,
      settings
    });
    const gstMode = normalizeText(snapshotItem.gstMode).toUpperCase();
    const itemName = normalizeText(snapshotItem.product || product?.product);
    const paymentTerms = toFiniteNumber(snapshotItem.paymentTerms ?? product?.paymentTerms, 0);

    if (gstMode === 'PAID') {
      if (netRates === null) {
        return;
      }
      paidRows.push({
        Party: partyName,
        Item: itemName,
        'Rate Before CD': round2(netRates / 0.95),
        'Net Rates After 5% CD': round2(netRates)
      });
      return;
    }

    if (afterSpecialDiscRate === null) {
      return;
    }

    const otherExpPct = paymentTerms === 15 ? 18 : paymentTerms === 30 ? 7.2 : 0;
    const afterCd5 = afterSpecialDiscRate * 0.95;
    const addOtherExp = afterSpecialDiscRate * (otherExpPct / 100);

    extraRows.push({
      Party: partyName,
      Item: itemName,
      'After Special Discount Price': round2(afterSpecialDiscRate),
      'After CD 5%': round2(afterCd5),
      'Add Other Exp': round2(addOtherExp),
      'Net Rates After 5% CD': round2(afterCd5 + addOtherExp)
    });
  });

  return {
    extraRows,
    paidRows,
    partyNameForFile: parties.size === 1 ? Array.from(parties)[0] : 'AllParties',
    itemCount: extraRows.length + paidRows.length
  };
}

export function exportOwnerApprovedRatesToXlsx(exportData) {
  const extraRows = exportData?.extraRows || [];
  const paidRows = exportData?.paidRows || [];
  if (extraRows.length + paidRows.length === 0) {
    throw new Error('No owner-approved saved items available to export.');
  }

  const workbook = XLSX.utils.book_new();
  if (extraRows.length > 0) {
    const sheet = XLSX.utils.json_to_sheet(extraRows);
    setSheetLayout(sheet, [22, 28, 24, 16, 16, 22]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'GST Extra');
  }
  if (paidRows.length > 0) {
    const sheet = XLSX.utils.json_to_sheet(paidRows);
    setSheetLayout(sheet, [22, 28, 18, 22]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'GST Paid');
  }

  const fileName = `Rate_Export_${sanitizeFilePart(exportData.partyNameForFile)}_${timestampForFile()}.xlsx`;
  XLSX.writeFile(workbook, fileName, { bookType: 'xlsx', cellStyles: true });
  return fileName;
}
