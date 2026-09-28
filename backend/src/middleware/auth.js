const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');

/**
 * Verifies the Bearer JWT and reloads the user from MongoDB on every request, so
 * deleted users and tokens issued before a password change are rejected immediately.
 */
async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(AppError.unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
  } catch {
    return next(AppError.unauthorized('Invalid or expired session. Please log in again.'));
  }
  if (typeof payload.sub !== 'string') return next(AppError.unauthorized('Invalid session'));

  const user = await User.findById(payload.sub).select('+passwordChangedAt');
  if (!user) return next(AppError.unauthorized('Invalid session'));
  if (user.tokenIssuedBeforePasswordChange(payload.iat)) {
    return next(AppError.unauthorized('Your password was changed. Please log in again.'));
  }
  req.user = user;
  return next();
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    return next();
  };
}

module.exports = { requireAuth, requireRole };
