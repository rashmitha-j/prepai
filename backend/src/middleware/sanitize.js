const AppError = require('../utils/AppError');

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Rejects request bodies containing MongoDB operator keys (`$gt`, `$where`...), dotted
 * keys or prototype-pollution keys. Legitimate PrepAI payloads never need them, so
 * rejecting (400) is clearer than silently stripping.
 */
function findUnsafeKey(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return null;
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) return key;
    const nested = findUnsafeKey(value[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function rejectUnsafeKeys(req, _res, next) {
  const bad = findUnsafeKey(req.body) || findUnsafeKey(req.query) || findUnsafeKey(req.params);
  if (bad) return next(AppError.badRequest('Request contains disallowed keys'));
  return next();
}

module.exports = { rejectUnsafeKeys, findUnsafeKey };
