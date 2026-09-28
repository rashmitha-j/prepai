const mongoose = require('mongoose');

/**
 * Source of truth for the RAG knowledge base. The vector index in the AI service is a
 * derived, rebuildable copy: chunks + embeddings are regenerated from these documents.
 */
const knowledgeDocumentSchema = new mongoose.Schema(
  {
    docId: { type: String, required: true, unique: true, match: /^[A-Za-z0-9_.:-]+$/, maxlength: 120 },
    title: { type: String, required: true, maxlength: 200 },
    topic: { type: String, required: true, maxlength: 60 },
    source: { type: String, default: '', maxlength: 300 },
    content: { type: String, required: true, select: false },
    contentHash: { type: String, required: true },
    wordCount: { type: Number, default: 0 },
    ingestionStatus: { type: String, enum: ['pending', 'ingested', 'failed'], default: 'pending' },
    chunkCount: { type: Number, default: 0 },
    embedding: { type: String, default: '' },
    ingestedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

knowledgeDocumentSchema.index({ topic: 1 });

module.exports = mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);
