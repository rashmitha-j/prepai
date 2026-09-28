const config = require('./config/env');
const createApp = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const knowledgeService = require('./services/knowledgeService');
const { detectCapabilities, sandboxDescription } = require('./services/codeRunner');
const logger = require('./utils/logger');

async function syncKnowledgeInBackground(attempt = 1) {
  try {
    const result = await knowledgeService.syncKnowledgeBase();
    logger.info(`Knowledge base sync: ${result.synced ? `${result.synced} document(s) indexed` : result.reason}`);
  } catch (err) {
    if (attempt < 5) {
      setTimeout(() => syncKnowledgeInBackground(attempt + 1), attempt * 15000).unref();
    } else {
      logger.warn(`Knowledge base sync gave up: ${err.message}`);
    }
  }
}

async function main() {
  await connectDatabase(config.mongoUri);
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`PrepAI API listening on http://localhost:${config.port} (${config.env})`);
    logger.info(`AI service: ${config.ai.url}`);
    detectCapabilities();
    logger.info(`Code runner: ${sandboxDescription()}`);
  });
  // AI generation can be slow on local models.
  server.requestTimeout = 5 * 60 * 1000;

  if (config.knowledgeAutoSync) syncKnowledgeInBackground();

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason instanceof Error ? reason.message : reason);
});

main().catch((err) => {
  logger.error(`Failed to start: ${err.message}`);
  process.exit(1);
});
