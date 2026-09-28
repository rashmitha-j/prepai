const { Types } = require('mongoose');
const AppError = require('./AppError');

function assertObjectId(id, what = 'Resource') {
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id) || String(new Types.ObjectId(id)) !== id) {
    throw AppError.notFound(what);
  }
  return id;
}

function parsePagination(query, { defaultLimit = 10, maxLimit = 50 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

const round1 = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

module.exports = { assertObjectId, parsePagination, round1 };
