import html2canvas from 'html2canvas';
import { round2 } from './calcEngine';
import { formatCurrencyINR } from './formatters';

function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeMode(value, fallback = '') {
  const mode = normalizeText(value).toUpperCase();
  return mode || fallback;
}

function normalizeNumberSignature(value) {
  const num = toNumber(value, null);
  if (num === null) {
    return '';
  }
  return String(round2(num));
}

function formatPercent(value) {
  const num = toNumber(value, null);
  if (num === null) {
    return '-';
  }
  return `${String(Number(num.toFixed(2)))}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const trimmed = normalized.replace(/^-+|-+$/g, '');
  return trimmed || 'party-rates';
}

function resolveConditionMeta(row) {
  const normalized = row?.normalized || {};
  const paymentTerms = toNumber(row?.paymentTerms, 0);
  const cdMode = normalizeMode(normalized.cdMode, 'NET_RATES');
  const cdPercent = cdMode === 'PERCENT'
    ? toNumber(normalized.cdPercent, null)
    : toNumber(normalized.defaultNetCdPercent, null);

  return {
    paymentTerms,
    gstMode: normalizeMode(normalized.gstMode, 'EXTRA'),
    freightMode: normalizeMode(normalized.freightMode, 'FOR'),
    cdMode,
    cdPercent
  };
}

function resolveRateColumns(row, condition) {
  const finalRate = toNumber(row?.calc?.finalRate, null);
  if (finalRate === null) {
    return null;
  }

  const cdMode = condition.cdMode;
  const cdPercent = toNumber(condition.cdPercent, null);
  let rate = finalRate;
  let netRate = null;

  if (cdMode === 'PERCENT') {
    const denominator = cdPercent !== null ? 1 - cdPercent / 100 : null;
    if (denominator && denominator > 0) {
      // Reverse-calculation of before-CD rate from the displayed final/net rate.
      rate = round2(finalRate / denominator);
    }
    netRate = finalRate;
  }

  const multiplier = condition.paymentTerms === 30 ? 2 : 1;
  return {
    cdMode,
    rate: round2(rate * multiplier),
    netRate: netRate === null ? null : round2(netRate * multiplier)
  };
}

function buildConditionSignature(condition) {
  return [
    condition.gstMode,
    condition.freightMode,
    condition.cdMode,
    normalizeNumberSignature(condition.cdPercent)
  ].join('|');
}

function buildPaymentTermsLabel(paymentTermsList) {
  const values = Array.isArray(paymentTermsList) ? paymentTermsList : [];
  if (values.length === 0) {
    return '-';
  }
  if (values.length === 1) {
    return `${values[0]} Days`;
  }
  return `Mixed (${values.join(' / ')} Days)`;
}

function buildConditionFooter(group) {
  const condition = group.condition;
  const paymentLine = `Payment Term: ${buildPaymentTermsLabel(group.paymentTermsList)}`;
  const gstLine = `GST: ${condition.gstMode || '-'}`;
  const freightLine = `Freight: ${condition.freightMode || '-'}`;
  const cdLine = condition.cdMode === 'PERCENT'
    ? `CD: ${condition.cdMode} (${formatPercent(condition.cdPercent)})`
    : `CD: ${condition.cdMode}${condition.cdPercent !== null ? ` (${formatPercent(condition.cdPercent)})` : ''}`;
  return [paymentLine, gstLine, freightLine, cdLine];
}

function buildGroups(ownerRows) {
  const groupsBySignature = new Map();

  ownerRows.forEach((row, index) => {
    const productName = normalizeText(row?.product);
    if (!productName) {
      return;
    }

    const condition = resolveConditionMeta(row);
    const rates = resolveRateColumns(row, condition);
    if (!rates) {
      return;
    }

    const signature = buildConditionSignature(condition);
    if (!groupsBySignature.has(signature)) {
      groupsBySignature.set(signature, {
        signature,
        order: index,
        condition,
        paymentTermsSet: new Set(),
        rows: []
      });
    }

    const group = groupsBySignature.get(signature);
    group.paymentTermsSet.add(condition.paymentTerms);
    group.rows.push({
      order: index,
      itemName: productName,
      rate: rates.rate,
      netRate: rates.netRate
    });
  });

  return Array.from(groupsBySignature.values())
    .sort((a, b) => {
      if (a.condition.paymentTerms !== b.condition.paymentTerms) {
        return a.condition.paymentTerms - b.condition.paymentTerms;
      }
      return a.order - b.order;
    })
    .map((group) => ({
      ...group,
      paymentTermsList: Array.from(group.paymentTermsSet.values())
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b),
      rows: group.rows.sort((a, b) => a.order - b.order)
    }));
}

export function buildCopyPartyRatesImageData({ partyName, ownerRows = [] }) {
  const safePartyName = normalizeText(partyName);
  if (!safePartyName) {
    return {
      canCopy: false,
      reason: 'Select a party to copy party rates.',
      groups: [],
      itemCount: 0,
      partyName: ''
    };
  }

  if (!Array.isArray(ownerRows) || ownerRows.length === 0) {
    return {
      canCopy: false,
      reason: 'Select owner rows to generate party rates image.',
      groups: [],
      itemCount: 0,
      partyName: safePartyName
    };
  }

  const groups = buildGroups(ownerRows);
  const itemCount = groups.reduce((total, group) => total + group.rows.length, 0);
  if (itemCount === 0) {
    return {
      canCopy: false,
      reason: 'Selected rows do not contain valid rate values.',
      groups: [],
      itemCount: 0,
      partyName: safePartyName
    };
  }

  return {
    canCopy: true,
    reason: '',
    groups,
    itemCount,
    partyName: safePartyName
  };
}

function buildRateCardMarkup(copyData) {
  const groupBlocks = copyData.groups.map((group) => {
    const isPercentMode = group.condition.cdMode === 'PERCENT';
    const headerCells = isPercentMode
      ? '<th>Item Name</th><th>Rate</th><th>Net Rate</th>'
      : '<th>Item Name</th><th>Rate</th>';

    const rowMarkup = group.rows.map((row) => {
      const rateCell = `<td class="value">${escapeHtml(formatCurrencyINR(row.rate))}</td>`;
      if (!isPercentMode) {
        return `<tr><td>${escapeHtml(row.itemName)}</td>${rateCell}</tr>`;
      }
      return `<tr><td>${escapeHtml(row.itemName)}</td>${rateCell}<td class="value">${escapeHtml(formatCurrencyINR(row.netRate ?? row.rate))}</td></tr>`;
    }).join('');

    const footerLines = buildConditionFooter(group)
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');

    return `
      <section class="group">
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rowMarkup}</tbody>
        </table>
        <div class="footer">${footerLines}</div>
      </section>
    `;
  }).join('');

  return `
    <style>
      .copy-party-rates-card {
        width: 720px;
        box-sizing: border-box;
        background: #ffffff;
        color: #102033;
        border: 1px solid #c8d4e3;
        border-radius: 14px;
        padding: 16px;
        font-family: "Segoe UI", Tahoma, sans-serif;
      }
      .copy-party-rates-card .title {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 10px;
      }
      .copy-party-rates-card .group {
        margin-top: 12px;
        border: 1px solid #dbe4ef;
        border-radius: 10px;
        overflow: hidden;
      }
      .copy-party-rates-card table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .copy-party-rates-card th,
      .copy-party-rates-card td {
        border: 1px solid #dbe4ef;
        padding: 7px 8px;
        font-size: 12px;
      }
      .copy-party-rates-card th {
        background: #f8fbff;
        text-align: left;
      }
      .copy-party-rates-card td.value {
        text-align: right;
        font-weight: 700;
        white-space: nowrap;
      }
      .copy-party-rates-card .footer {
        border-top: 1px solid #dbe4ef;
        background: #fcfdff;
        padding: 8px 10px;
        display: grid;
        gap: 2px;
        font-size: 11px;
      }
    </style>
    <div class="copy-party-rates-card">
      <div class="title">Party: ${escapeHtml(copyData.partyName)}</div>
      ${groupBlocks}
    </div>
  `;
}

async function renderCardToPngBlob(copyData) {
  if (typeof document === 'undefined') {
    throw new Error('DOM is unavailable for image generation.');
  }

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '760px';
  host.style.pointerEvents = 'none';
  host.innerHTML = buildRateCardMarkup(copyData);
  document.body.appendChild(host);

  try {
    const cardNode = host.querySelector('.copy-party-rates-card');
    if (!cardNode) {
      throw new Error('Failed to prepare rate card template.');
    }

    const canvas = await html2canvas(cardNode, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false
    });

    const blob = await new Promise((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
    });

    if (!blob) {
      throw new Error('Failed to generate PNG image.');
    }

    return blob;
  } finally {
    document.body.removeChild(host);
  }
}

async function copyImageBlobToClipboard(blob) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return false;
  }
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
  return true;
}

function downloadPngBlob(blob, partyName) {
  if (typeof document === 'undefined') {
    throw new Error('Download fallback is unavailable in this environment.');
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slugify(partyName)}-party-rates.png`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function copyPartyRatesImage(copyData) {
  if (!copyData?.canCopy) {
    throw new Error(copyData?.reason || 'No valid rows available for party rates image.');
  }

  const blob = await renderCardToPngBlob(copyData);

  try {
    const copied = await copyImageBlobToClipboard(blob);
    if (copied) {
      return { method: 'clipboard', itemCount: copyData.itemCount };
    }
  } catch (_) {
    // Fallback to download when direct clipboard image write fails.
  }

  downloadPngBlob(blob, copyData.partyName);
  return { method: 'download', itemCount: copyData.itemCount };
}
