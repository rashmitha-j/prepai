const resumeService = require('../services/resumeService');
const { removeTempFile } = require('../middleware/upload');

exports.upload = async (req, res) => {
  try {
    const resume = await resumeService.uploadResume(req.user, req.file);
    res.status(201).json({ resume });
  } finally {
    await removeTempFile(req.file);
  }
};

exports.list = async (req, res) => res.json({ resumes: await resumeService.listResumes(req.user._id) });

exports.get = async (req, res) => {
  const resume = await resumeService.getResume(req.user._id, req.params.id, { withText: true });
  res.json({ resume });
};

exports.reanalyze = async (req, res) => res.json({ resume: await resumeService.reanalyze(req.user._id, req.params.id) });

exports.remove = async (req, res) => {
  await resumeService.deleteResume(req.user._id, req.params.id);
  res.status(204).end();
};
