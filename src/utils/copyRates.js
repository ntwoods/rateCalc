import { makeRowKey } from './keys';
import { formatCurrencyINR, formatDate, safeText } from './formatters';

const OWNER_APPROVED_TAG = 'OWNER_APPROVED';
const PAYMENT_TERM_FALLBACK = 'Not Specified';
const STANDARD_CONDITION = 'Standard';

function normalizeActionTag(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toEpoch(value) {
  if (!value) {
    return -1;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? -1 : date.getTime();
}

function normalizeNumberSignature(value) {
  const num = toFiniteNumber(value);
  if (num === null) {
    return '';
  }
  return String(Number(num.toFixed(6)));
}

function formatNumberCompact(value) {
  const num = toFiniteNumber(value);
  if (num === null) {
    return '';
  }
  return String(Number(num.toFixed(2)));
}

function getPaymentTermGroupInfo(paymentTerms) {
  const numeric = toFiniteNumber(paymentTerms);
  if (numeric !== null && numeric > 0) {
    return {
      key: String(Number(numeric.toFixed(4))),
      label: `${formatNumberCompact(numeric)} Days`,
      sortValue: numeric
    };
  }

  return {
    key: PAYMENT_TERM_FALLBACK.toLowerCase(),
    label: PAYMENT_TERM_FALLBACK,
    sortValue: Number.POSITIVE_INFINITY
  };
}

function buildConditionMeta({
  gstMode,
  freightMode,
  cdMode,
  cdPercent,
  specialDiscPct
}) {
  const gst = normalizeText(gstMode).toUpperCase();
  const freight = normalizeText(freightMode).toUpperCase();
  const cd = normalizeText(cdMode).toUpperCase();
  const specialDisc = toFiniteNumber(specialDiscPct);
  const cdPercentValue = toFiniteNumber(cdPercent);

  const parts = [];
  if (gst) {
    parts.push(`GST: ${gst}`);
  }
  if (freight) {
    parts.push(`Freight: ${freight}`);
  }
  if (cd) {
    if (cd === 'PERCENT' && cdPercentValue !== null) {
      parts.push(`CD: ${cd} (${formatNumberCompact(cdPercentValue)}%)`);
    } else {
      parts.push(`CD: ${cd}`);
    }
  } else if (cdPercentValue !== null) {
    parts.push(`CD: ${formatNumberCompact(cdPercentValue)}%`);
  }
  if (specialDisc !== null) {
    parts.push(`Special Disc: ${formatNumberCompact(specialDisc)}%`);
  }

  const displayText = parts.length > 0 ? parts.join(' | ') : STANDARD_CONDITION;

  return {
    displayText,
    signature: [
      normalizeText(gst).toUpperCase(),
      normalizeText(freight).toUpperCase(),
      normalizeText(cd).toUpperCase(),
      cd === 'PERCENT' ? normalizeNumberSignature(cdPercentValue) : '',
      normalizeNumberSignature(specialDisc)
    ].join('|')
  };
}

function collectApprovedRows({
  displayedProducts = [],
  activeSnapshotMap = {},
  latestHistoryByRowKey = {},
  snapshotActive = false,
  getRowKey
}) {
  const approvedRows = [];

  displayedProducts.forEach((product, index) => {
    const rowKey = typeof getRowKey === 'function'
      ? getRowKey(product)
      : makeRowKey(product?.category, product?.product);

    const snapshotItem = activeSnapshotMap[rowKey] || null;
    const historyItem = latestHistoryByRowKey[rowKey] || null;
    const useSnapshot = snapshotActive && Boolean(snapshotItem);

    const actionTag = normalizeActionTag(
      useSnapshot ? snapshotItem?.actionTag : historyItem?.lastActionTag
    );
    if (actionTag !== OWNER_APPROVED_TAG) {
      return;
    }

    const finalRate = toFiniteNumber(
      useSnapshot ? snapshotItem?.finalRate : historyItem?.lastFinalRate
    );
    if (finalRate === null) {
      return;
    }

    const paymentTerms = useSnapshot
      ? snapshotItem?.paymentTerms || product?.paymentTerms
      : product?.paymentTerms;

    const timestamp = normalizeText(
      useSnapshot ? snapshotItem?.snapshotDateTime : historyItem?.lastTimestamp
    );

    const condition = buildConditionMeta({
      gstMode: useSnapshot ? snapshotItem?.gstMode : historyItem?.lastGSTMode,
      freightMode: useSnapshot ? snapshotItem?.freightMode : historyItem?.lastFreightMode,
      cdMode: useSnapshot ? snapshotItem?.cdMode : historyItem?.lastCDMode,
      cdPercent: useSnapshot ? snapshotItem?.cdPercent : historyItem?.lastCDPercent,
      specialDiscPct: useSnapshot ? snapshotItem?.specialDiscPct : historyItem?.lastSpecialDiscPct
    });

    approvedRows.push({
      rowKey,
      order: index,
      product: normalizeText(product?.product) || 'Unnamed Product',
      finalRate,
      paymentTerms,
      approvalTimestamp: timestamp,
      conditionDisplayText: condition.displayText,
      conditionSignature: condition.signature
    });
  });

  return approvedRows;
}

function buildGroupedCopyText({
  partyName,
  approvedRows
}) {
  if (!Array.isArray(approvedRows) || approvedRows.length === 0) {
    return '';
  }

  const groupedByTerm = new Map();
  let latestApprovalEpoch = -1;

  approvedRows.forEach((row) => {
    const paymentMeta = getPaymentTermGroupInfo(row.paymentTerms);
    const termKey = paymentMeta.key;
    const timestampEpoch = toEpoch(row.approvalTimestamp);
    if (timestampEpoch > latestApprovalEpoch) {
      latestApprovalEpoch = timestampEpoch;
    }

    if (!groupedByTerm.has(termKey)) {
      groupedByTerm.set(termKey, {
        ...paymentMeta,
        conditionGroups: new Map()
      });
    }

    const termGroup = groupedByTerm.get(termKey);
    const conditionKey = row.conditionSignature || STANDARD_CONDITION.toLowerCase();

    if (!termGroup.conditionGroups.has(conditionKey)) {
      termGroup.conditionGroups.set(conditionKey, {
        label: row.conditionDisplayText || STANDARD_CONDITION,
        rows: []
      });
    }

    termGroup.conditionGroups.get(conditionKey).rows.push(row);
  });

  const approvedOnText = latestApprovalEpoch > -1
    ? formatDate(new Date(latestApprovalEpoch), { dateStyle: 'medium', timeStyle: 'short' })
    : '-';
  const lines = [
    `Approved On: ${approvedOnText}`,
    `Party: ${safeText(partyName, '-')}`,
    ''
  ];

  const orderedTerms = Array.from(groupedByTerm.values())
    .sort((a, b) => {
      if (a.sortValue !== b.sortValue) {
        return a.sortValue - b.sortValue;
      }
      return a.label.localeCompare(b.label);
    });

  orderedTerms.forEach((termGroup, termIndex) => {
    lines.push(`Payment Term: ${termGroup.label}`);

    const orderedConditions = Array.from(termGroup.conditionGroups.values());
    orderedConditions.forEach((conditionGroup) => {
      lines.push(`Condition: ${conditionGroup.label || STANDARD_CONDITION}`);
      lines.push('Item Rate');

      conditionGroup.rows
        .sort((a, b) => a.order - b.order)
        .forEach((row) => {
          lines.push(`${row.product} ${formatCurrencyINR(row.finalRate)}`);
        });

      lines.push('');
    });

    if (termIndex < orderedTerms.length - 1 && lines[lines.length - 1] !== '') {
      lines.push('');
    }
  });

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n').trim();
}

export function buildOwnerApprovedRatesCopyData({
  partyName,
  displayedProducts = [],
  activeSnapshotMap = {},
  latestHistoryByRowKey = {},
  snapshotActive = false,
  getRowKey
}) {
  const safePartyName = normalizeText(partyName);
  if (!safePartyName) {
    return {
      canCopy: false,
      reason: 'Select a party to copy rates.',
      copyText: '',
      itemCount: 0
    };
  }

  const approvedRows = collectApprovedRows({
    displayedProducts,
    activeSnapshotMap,
    latestHistoryByRowKey,
    snapshotActive,
    getRowKey
  });

  if (approvedRows.length === 0) {
    return {
      canCopy: false,
      reason: 'No owner-approved rates in the current view.',
      copyText: '',
      itemCount: 0
    };
  }

  const copyText = buildGroupedCopyText({
    partyName: safePartyName,
    approvedRows
  });

  if (!copyText) {
    return {
      canCopy: false,
      reason: 'Nothing valid to copy.',
      copyText: '',
      itemCount: 0
    };
  }

  return {
    canCopy: true,
    reason: '',
    copyText,
    itemCount: approvedRows.length
  };
}

export async function copyPlainTextToClipboard(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error('Nothing to copy.');
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard unavailable in this environment.');
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', 'readonly');
  textArea.style.position = 'fixed';
  textArea.style.top = '-9999px';
  textArea.style.left = '-9999px';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error('Clipboard copy is not supported in this browser.');
  }
}
