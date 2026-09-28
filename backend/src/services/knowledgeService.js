/**
 * Knowledge base management. MongoDB holds the documents (source of truth); the AI
 * service holds the derived vector index. `syncKnowledgeBase` rebuilds the index when it
 * is empty or out of date (e.g. after a redeploy with an ephemeral disk, or when the
 * embedding model changes and a fresh collection is created).
 */
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const aiClient = require('./aiClient');

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

const listDocuments = () =>
  KnowledgeDocument.find().select('-content').sort({ topic: 1, title: 1 }).lean();

async function getDocument(docId) {
  const doc = await KnowledgeDocument.findOne({ docId }).select('+content').lean();
  if (!doc) throw AppError.notFound('Knowledge document');
  return doc;
}

async function upsertDocument({ docId, title, topic, source, content }) {
  await KnowledgeDocument.updateOne(
    { docId },
    {
      $set: {
        title, topic, source, content, contentHash: hash(content),
        wordCount: content.split(/\s+/).filter(Boolean).length, ingestionStatus: 'pending',
      },
    },
    { upsert: true, runValidators: true },
  );
  return KnowledgeDocument.findOne({ docId });
}

async function ingestDocuments(docs) {
  if (!docs.length) return { ingested: 0, chunks: 0 };
  const payload = docs.map((d) => ({ id: d.docId, title: d.title, topic: d.topic, source: d.source || '', content: d.content }));
  let chunks = 0;
  // Batch to keep request bodies small.
  for (let i = 0; i < payload.length; i += 10) {
    const batch = payload.slice(i, i + 10);
    try {
      const result = await aiClient.ingest(batch);
      chunks += result.totalChunks;
      for (const r of result.documents) {
        await KnowledgeDocument.updateOne(
          { docId: r.id },
          { $set: { ingestionStatus: 'ingested', chunkCount: r.chunks, embedding: result.embedding, ingestedAt: new Date(), lastError: null } },
        );
      }
    } catch (err) {
      await KnowledgeDocument.updateMany(
        // sanitizeFilter is on globally, so intentional operators must be marked as trusted.
        { docId: mongoose.trusted({ $in: batch.map((b) => b.id) }) },
        { $set: { ingestionStatus: 'failed', lastError: err.message } },
      );
      throw err;
    }
  }
  return { ingested: docs.length, chunks };
}

async function createDocument(input) {
  const doc = await upsertDocument(input);
  await ingestDocuments([{ ...input, docId: doc.docId }]);
  return KnowledgeDocument.findOne({ docId: doc.docId }).lean();
}

async function deleteDocument(docId) {
  const doc = await KnowledgeDocument.findOne({ docId });
  if (!doc) throw AppError.notFound('Knowledge document');
  await aiClient.deleteDocument(docId).catch((err) => logger.warn(`Vector delete failed: ${err.message}`));
  await doc.deleteOne();
}

async function reindexAll() {
  const docs = await KnowledgeDocument.find().select('+content').lean();
  return ingestDocuments(docs);
}

/** Re-ingest documents missing from the vector index. Safe to call on every startup. */
async function syncKnowledgeBase() {
  const docs = await KnowledgeDocument.find().select('+content').lean();
  if (!docs.length) return { synced: 0, reason: 'no documents (run npm run seed)' };
  const stats = await aiClient.ragStats();
  const indexed = stats.perDocument || {};
  const stale = docs.filter((d) => !indexed[d.docId] || d.embedding !== stats.embedding || d.ingestionStatus !== 'ingested');
  if (!stale.length) return { synced: 0, reason: 'index up to date' };
  const result = await ingestDocuments(stale);
  return { synced: result.ingested, chunks: result.chunks };
}

async function search({ query, topic, topK }) {
  const result = await aiClient.retrieve({ query, topK, ...(topic ? { topic } : {}) });
  return {
    query: result.query,
    embedding: result.embedding,
    results: result.chunks.map((c) => ({
      id: c.id, docId: c.docId, title: c.title, topic: c.topic, section: c.section, score: c.score, text: c.text,
    })),
  };
}

async function status() {
  const [documents, ingested] = await Promise.all([
    KnowledgeDocument.countDocuments(),
    KnowledgeDocument.countDocuments({ ingestionStatus: 'ingested' }),
  ]);
  let index;
  try {
    const stats = await aiClient.ragStats();
    index = { store: stats.store, embedding: stats.embedding, documents: stats.documents, chunks: stats.chunks };
  } catch (err) {
    index = { error: err.message };
  }
  return { documents, ingested, index };
}

module.exports = {
  listDocuments, getDocument, upsertDocument, ingestDocuments, createDocument, deleteDocument, reindexAll,
  syncKnowledgeBase, search, status,
};
