const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const handler = (message) => (_req, res) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message } });

// In tests the limits are generous so suites are not flaky; the limiter itself is still exercised.
const scale = config.isTest ? 100 : 1;

/** Brute-force protection for login/register/password change (per IP). */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20 * scale,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: handler('Too many authentication attempts. Please try again in a few minutes.'),
});

/** LLM calls are slow and may cost money: limit per user. */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20 * scale,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : rateLimit.ipKeyGenerator(req.ip)),
  handler: handler('Too many AI requests. Please wait a minute and try again.'),
});

/** Compiling and running code is expensive: limit per user. */
const codeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10 * scale,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : rateLimit.ipKeyGenerator(req.ip)),
  handler: handler('Too many code submissions. Please wait a minute and try again.'),
});

/** Broad safety net for the whole API. */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300 * scale,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: handler('Too many requests. Please slow down.'),
});

module.exports = { authLimiter, aiLimiter, codeLimiter, apiLimiter };
