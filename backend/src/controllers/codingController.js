const codingService = require('../services/codingService');

exports.listProblems = async (req, res) => res.json({ problems: await codingService.listProblems(req.user._id) });

exports.getProblem = async (req, res) => res.json({ problem: await codingService.getProblem(req.params.slug) });

exports.submit = async (req, res) => res.json({ result: await codingService.submit(req.user._id, req.params.slug, req.body) });

exports.listSubmissions = async (req, res) =>
  res.json({ submissions: await codingService.listSubmissions(req.user._id, req.params.slug) });

exports.getSubmission = async (req, res) => res.json({ submission: await codingService.getSubmission(req.user._id, req.params.id) });

exports.explain = async (req, res) => {
  const submission = await codingService.explainSubmission(req.user._id, req.params.id);
  res.json({ explanation: submission.aiExplanation });
};
