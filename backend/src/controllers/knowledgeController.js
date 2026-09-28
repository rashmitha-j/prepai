const knowledgeService = require('../services/knowledgeService');

exports.list = async (_req, res) => res.json({ documents: await knowledgeService.listDocuments() });

exports.get = async (req, res) => res.json({ document: await knowledgeService.getDocument(req.params.docId) });

exports.search = async (req, res) => res.json(await knowledgeService.search(req.body));

exports.status = async (_req, res) => res.json(await knowledgeService.status());

exports.create = async (req, res) => res.status(201).json({ document: await knowledgeService.createDocument(req.body) });

exports.remove = async (req, res) => {
  await knowledgeService.deleteDocument(req.params.docId);
  res.status(204).end();
};

exports.reindex = async (_req, res) => res.json(await knowledgeService.reindexAll());
