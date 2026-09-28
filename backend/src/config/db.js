const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Defence in depth against NoSQL injection: Mongoose wraps any `$`-prefixed keys that
// reach a query filter in `$eq`, so `{ email: { $ne: null } }` cannot match every user.
mongoose.set('sanitizeFilter', true);
// Ignore filter fields that are not in the schema instead of passing them to MongoDB.
mongoose.set('strictQuery', true);

async function connectDatabase(uri) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, autoIndex: true });
  logger.info(`MongoDB connected (${mongoose.connection.name})`);
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

function databaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}

module.exports = { connectDatabase, disconnectDatabase, databaseStatus };
