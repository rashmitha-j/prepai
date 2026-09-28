const fs = require('node:fs');
const Resume = require('../models/Resume');
const MatchAnalysis = require('../models/MatchAnalysis');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { extractPdfText } = require('../utils/pdf');
const { hasPdfSignature, sanitizeFilename } = require('../utils/files');
const aiClient = require('./aiClient');

const MAX_RESUMES_PER_USER = 20;
const LIST_FIELDS = 'filename fileSize pageCount analysisStatus analysisMode skills summary createdAt updatedAt';

function applyAnalysis(resume, analysis) {
  resume.summary = analysis.summary || '';
  resume.skills = analysis.skills || [];
  resume.technologies = analysis.technologies || [];
  resume.projects = analysis.projects || [];
  resume.experience = analysis.experience || [];
  resume.education = analysis.education || [];
  resume.strengths = analysis.strengths || [];
  resume.possibleGaps = analysis.possibleGaps || [];
  resume.analysisMode = analysis.analysisMode;
  resume.analysisWarnings = analysis.warnings || [];
  resume.analysisStatus = 'completed';
  resume.analysisError = null;
  resume.analyzedAt = new Date();
}

/** Run AI analysis; failures are stored on the document so the upload itself still succeeds. */
async function analyze(resume, text) {
  try {
    applyAnalysis(resume, await aiClient.analyzeResume(text));
  } catch (err) {
    logger.warn(`Resume analysis failed: ${err.message}`);
    resume.analysisStatus = 'failed';
    resume.analysisError = err instanceof AppError ? err.message : 'Analysis failed';
  }
  await resume.save();
  return resume;
}

/**
 * Upload pipeline: signature check → text extraction → persist → analyse → always clean up.
 */
async function uploadResume(user, file) {
  if (!file) throw AppError.badRequest('Please attach a PDF file in the "resume" field.');
  try {
    const count = await Resume.countDocuments({ user: user._id });
    if (count >= MAX_RESUMES_PER_USER) {
      throw AppError.conflict(`You can store up to ${MAX_RESUMES_PER_USER} resumes. Delete an old one first.`);
    }
    const buffer = await fs.promises.readFile(file.path);
    if (!hasPdfSignature(buffer)) {
      throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'The file does not look like a real PDF.');
    }
    const { text, pageCount } = await extractPdfText(buffer);
    const resume = await Resume.create({
      user: user._id,
      filename: sanitizeFilename(file.originalname),
      fileSize: file.size,
      pageCount,
      extractedText: text,
      textLength: text.length,
    });
    await analyze(resume, text);
    const view = resume.toJSON();
    delete view.extractedText; // full text is only returned by GET /api/resumes/:id
    return view;
  } finally {
    await fs.promises.rm(file.path, { force: true }).catch(() => {});
  }
}

async function listResumes(userId) {
  return Resume.find({ user: userId }).select(LIST_FIELDS).sort({ createdAt: -1 }).lean();
}

async function getResume(userId, id, { withText = false } = {}) {
  const query = Resume.findOne({ _id: id, user: userId });
  if (withText) query.select('+extractedText');
  const resume = await query;
  if (!resume) throw AppError.notFound('Resume');
  return resume;
}

async function reanalyze(userId, id) {
  const resume = await getResume(userId, id, { withText: true });
  return analyze(resume, resume.extractedText);
}

async function deleteResume(userId, id) {
  const resume = await getResume(userId, id);
  await MatchAnalysis.deleteMany({ user: userId, resume: resume._id });
  await resume.deleteOne();
}

module.exports = { uploadResume, listResumes, getResume, reanalyze, deleteResume, MAX_RESUMES_PER_USER };
