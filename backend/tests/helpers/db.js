/**
 * Test database. Uses MONGO_TEST_URI when provided (e.g. CI service container);
 * otherwise starts an in-memory MongoDB via mongodb-memory-server.
 * Each test file gets its own randomly named database which is dropped afterwards.
 */
const crypto = require('node:crypto');
const mongoose = require('mongoose');

let memoryServer;

async function connect() {
  let base = process.env.MONGO_TEST_URI;
  if (!base) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    base = memoryServer.getUri();
  }
  const url = new URL(base);
  url.pathname = `/prepai_test_${crypto.randomBytes(4).toString('hex')}`;
  require('../../src/config/db'); // applies sanitizeFilter / strictQuery settings
  await mongoose.connect(url.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function clear() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function disconnect() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (memoryServer) await memoryServer.stop();
}

module.exports = { connect, clear, disconnect };
