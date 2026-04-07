export function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function makeRowKey(category, product) {
  return `${normalizeToken(category)}|${normalizeToken(product)}`;
}

