export function safeText(value, fallback = '-') {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

export function toNumberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function formatCurrencyINR(value, options = {}) {
  const amount = toNumberOrZero(value);
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2
  } = options;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits,
    maximumFractionDigits
  }).format(amount);
}

export function formatDate(value, options = {}) {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const {
    locale = 'en-IN',
    dateStyle = 'medium',
    timeStyle = undefined
  } = options;

  return new Intl.DateTimeFormat(locale, {
    dateStyle,
    timeStyle
  }).format(date);
}