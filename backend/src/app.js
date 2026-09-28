const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config/env');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit');
const { rejectUnsafeKeys } = require('./middleware/sanitize');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1); // behind Render/Vercel proxies: real client IPs for rate limiting

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin/non-browser requests (no Origin header) and configured frontends only.
        if (!origin || config.clientUrls.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  if (!config.isTest) app.use(morgan(config.isProduction ? 'combined' : 'dev'));

  app.use('/api', apiLimiter, rejectUnsafeKeys, routes);
  app.get('/', (_req, res) => res.json({ name: 'PrepAI API', health: '/api/health' }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
