const jobService = require('../services/jobService');

exports.create = async (req, res) => res.status(201).json({ job: await jobService.createJob(req.user, req.body) });

exports.list = async (req, res) => res.json({ jobs: await jobService.listJobs(req.user._id) });

exports.get = async (req, res) => {
  const [job, matches] = await Promise.all([
    jobService.getJob(req.user._id, req.params.id),
    jobService.listMatches(req.user._id, req.params.id),
  ]);
  res.json({ job, matches });
};

exports.reanalyze = async (req, res) => res.json({ job: await jobService.reanalyze(req.user._id, req.params.id) });

exports.remove = async (req, res) => {
  await jobService.deleteJob(req.user._id, req.params.id);
  res.status(204).end();
};

exports.match = async (req, res) => {
  const match = await jobService.analyzeMatch(req.user._id, req.params.id, req.body.resumeId);
  res.json({ match });
};

exports.listMatches = async (req, res) => res.json({ matches: await jobService.listMatches(req.user._id, req.params.id) });
