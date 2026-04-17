export function normalizeUserRole(value) {
  const role = String(value || '').trim().toUpperCase();
  return role || 'USER';
}

export function isAdminUser(roleValue) {
  return normalizeUserRole(roleValue) === 'ADMIN';
}
