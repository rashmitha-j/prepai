const dashboardService = require('../services/dashboardService');
const aiClient = require('../services/aiClient');
const config = require('../config/env');
const { databaseStatus } = require('../config/db');
const { sandboxDescription } = require('../services/codeRunner');

exports.dashboard = async (req, res) => res.json(await dashboardService.getDashboard(req.user._id));

/** Public health endpoint: reports dependency status without exposing configuration. */
exports.health = async (_req, res) => {
  const ai = await aiClient.health();
  const db = databaseStatus();
  const provider = ai.provider || {};
  const body = {
    status: db === 'connected' && ai.status === 'ok' ? 'ok' : db === 'connected' ? 'degraded' : 'error',
    service: 'prepai-backend',
    database: db,
    aiService: ai.status === 'unreachable' ? 'unreachable' : 'reachable',
    aiProvider: {
      name: provider.provider || null,
      model: provider.model || null,
      status: provider.status || 'unknown',
      // Details can contain internal hostnames, so they are only shown outside production.
      detail: config.isProduction ? null : provider.detail || null,
    },
    vectorStore: ai.vectorStore ? { type: ai.vectorStore.type, chunks: ai.vectorStore.chunks } : null,
    embeddings: ai.embeddings?.embedding || null,
    codeRunner: sandboxDescription(),
    time: new Date().toISOString(),
  };
  res.status(db === 'connected' ? 200 : 503).json(body);
};
