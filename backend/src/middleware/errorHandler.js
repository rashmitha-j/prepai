const config = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function notFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`));
}

/**
 * Centralised error handler. Operational errors (AppError) return their message;
 * everything else returns a generic 500 without stack traces or internals.
 */
function errorHandler(err, req, res, _next) {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'MALFORMED_JSON', message: 'Malformed JSON body' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }
  if (err?.name === 'CastError') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  }
  if (err?.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these details already exists' } });
  }

  if (err instanceof AppError) {
    if (err.status >= 500) logger.warn(`${req.method} ${req.originalUrl} -> ${err.status} ${err.code}: ${err.message}`);
    const body = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }

  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, config.isProduction ? err?.message : err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}

module.exports = { notFound, errorHandler };
