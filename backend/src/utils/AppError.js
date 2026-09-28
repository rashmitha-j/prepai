/**
 * Operational error with an HTTP status and a stable machine-readable code.
 * Only the message/code/details of AppErrors are ever sent to clients.
 */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static validation(message = 'Validation failed', details) {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(what = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${what} not found`);
  }

  static conflict(message) {
    return new AppError(409, 'CONFLICT', message);
  }

  static unavailable(message, code = 'SERVICE_UNAVAILABLE') {
    return new AppError(503, code, message);
  }
}

module.exports = AppError;
