const JobDescription = require('../models/JobDescription');
const MatchAnalysis = require('../models/MatchAnalysis');
const Resume = require('../models/Resume');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const aiClient = require('./aiClient');

const MAX_JOBS_PER_USER = 50;
const LIST_FIELDS = 'title company analysisStatus analysisMode experienceLevel requiredSkills createdAt';

async function analyze(job) {
  try {
    const a = await aiClient.analyzeJob({ text: job.rawText, title: job.title, company: job.company });
    job.title = job.title || a.title || 'Untitled role';
    job.company = job.company || a.company || '';
    job.summary = a.summary || '';
    job.requiredSkills = a.requiredSkills || [];
    job.preferredSkills = a.preferredSkills || [];
    job.responsibilities = a.responsibilities || [];
    job.technologies = a.technologies || [];
    job.experienceLevel = a.experienceLevel || 'unspecified';
    job.analysisMode = a.analysisMode;
    job.analysisWarnings = a.warnings || [];
    job.analysisStatus = 'completed';
    job.analysisError = null;
    job.analyzedAt = new Date();
  } catch (err) {
    logger.warn(`Job analysis failed: ${err.message}`);
    job.title = job.title || 'Untitled role';
    job.analysisStatus = 'failed';
    job.analysisError = err instanceof AppError ? err.message : 'Analysis failed';
  }
  await job.save();
  return job;
}

async function createJob(user, { title, company, rawText }) {
  if ((await JobDescription.countDocuments({ user: user._id })) >= MAX_JOBS_PER_USER) {
    throw AppError.conflict(`You can store up to ${MAX_JOBS_PER_USER} job descriptions. Delete an old one first.`);
  }
  const job = await JobDescription.create({ user: user._id, title, company, rawText });
  return analyze(job);
}

const listJobs = (userId) => JobDescription.find({ user: userId }).select(LIST_FIELDS).sort({ createdAt: -1 }).lean();

async function getJob(userId, id) {
  const job = await JobDescription.findOne({ _id: id, user: userId });
  if (!job) throw AppError.notFound('Job description');
  return job;
}

async function reanalyze(userId, id) {
  return analyze(await getJob(userId, id));
}

async function deleteJob(userId, id) {
  const job = await getJob(userId, id);
  await MatchAnalysis.deleteMany({ user: userId, job: job._id });
  await job.deleteOne();
}

/** Compact profiles sent to the AI service — structured fields only, never the raw documents. */
function resumeProfile(resume) {
  return {
    summary: (resume.summary || '').slice(0, 3000),
    skills: resume.skills.slice(0, 150),
    technologies: resume.technologies.slice(0, 150),
    projects: resume.projects.slice(0, 20).map((p) => ({
      name: (p.name || 'Untitled project').slice(0, 200),
      description: (p.description || '').slice(0, 1000),
      technologies: (p.technologies || []).slice(0, 40),
    })),
    experience: resume.experience
      .slice(0, 20)
      .map((e) => [e.title, e.organization, e.duration].filter(Boolean).join(' — ').slice(0, 300)),
  };
}

function jobProfile(job) {
  return {
    title: job.title || '',
    summary: (job.summary || '').slice(0, 3000),
    requiredSkills: job.requiredSkills.slice(0, 100),
    preferredSkills: job.preferredSkills.slice(0, 100),
    technologies: job.technologies.slice(0, 100),
    responsibilities: job.responsibilities.slice(0, 30).map((r) => r.slice(0, 300)),
    experienceLevel: job.experienceLevel,
  };
}

async function analyzeMatch(userId, jobId, resumeId) {
  const [job, resume] = await Promise.all([
    getJob(userId, jobId),
    Resume.findOne({ _id: resumeId, user: userId }),
  ]);
  if (!resume) throw AppError.notFound('Resume');
  if (job.analysisStatus !== 'completed') throw AppError.conflict('Analyse the job description first (use "Re-analyse").');
  if (resume.analysisStatus !== 'completed') throw AppError.conflict('Analyse the resume first (use "Re-analyse").');

  const result = await aiClient.analyzeMatch({ resume: resumeProfile(resume), job: jobProfile(job) });
  const doc = {
    matchingSkills: result.matchingSkills,
    missingSkills: result.missingSkills,
    missingPreferredSkills: result.missingPreferredSkills,
    coverage: result.coverage,
    technologyAlignment: result.technologyAlignment,
    relevantProjects: result.relevantProjects,
    experienceAlignment: result.experienceAlignment,
    interviewTopics: result.interviewTopics,
    recommendations: result.recommendations,
    analysisMode: result.analysisMode,
    warnings: result.warnings,
    disclaimer: result.disclaimer,
  };
  return MatchAnalysis.findOneAndUpdate(
    { user: userId, job: job._id, resume: resume._id },
    { $set: doc },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).populate('resume', 'filename');
}

const listMatches = (userId, jobId) =>
  MatchAnalysis.find({ user: userId, job: jobId }).sort({ updatedAt: -1 }).populate('resume', 'filename').lean();

module.exports = {
  createJob, listJobs, getJob, reanalyze, deleteJob, analyzeMatch, listMatches, resumeProfile, jobProfile, MAX_JOBS_PER_USER,
};
