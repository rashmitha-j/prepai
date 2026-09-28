const interviewService = require('../services/interviewService');

exports.create = async (req, res) => res.status(201).json({ interview: await interviewService.startInterview(req.user, req.body) });

exports.list = async (req, res) => res.json(await interviewService.listInterviews(req.user._id, req.validatedQuery || {}));

exports.get = async (req, res) => res.json({ interview: await interviewService.getInterview(req.user._id, req.params.id) });

exports.answer = async (req, res) => {
  const result = await interviewService.submitAnswer(req.user._id, req.params.id, req.body.answer);
  res.json({ interview: result.session, evaluation: result.evaluation, nextQuestion: result.nextQuestion, nextError: result.nextError });
};

exports.next = async (req, res) => res.json({ interview: await interviewService.nextQuestion(req.user._id, req.params.id) });

exports.complete = async (req, res) => {
  const { session, report } = await interviewService.completeInterview(req.user._id, req.params.id);
  res.json({ interview: session, report });
};

exports.abandon = async (req, res) => res.json({ interview: await interviewService.abandonInterview(req.user._id, req.params.id) });

exports.report = async (req, res) => {
  const { session, report } = await interviewService.getReport(req.user._id, req.params.id);
  res.json({ interview: session, report });
};

exports.remove = async (req, res) => {
  await interviewService.deleteInterview(req.user._id, req.params.id);
  res.status(204).end();
};
