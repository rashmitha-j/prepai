const mongoose = require('mongoose');

/** Result of an "Interview Preparation Match Analysis" between one resume and one job. */
const matchAnalysisSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    resume: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'JobDescription', required: true },
    matchingSkills: [String],
    missingSkills: [String],
    missingPreferredSkills: [String],
    coverage: {
      requiredMatched: Number,
      requiredTotal: Number,
      preferredMatched: Number,
      preferredTotal: Number,
      percent: { type: Number, default: null },
      label: String,
    },
    technologyAlignment: { matched: [String], missing: [String] },
    relevantProjects: [{ _id: false, name: String, reason: String }],
    experienceAlignment: String,
    interviewTopics: [String],
    recommendations: [String],
    analysisMode: { type: String, enum: ['ai', 'heuristic'] },
    warnings: [String],
    disclaimer: String,
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

// One analysis per (resume, job) pair; re-running replaces it.
matchAnalysisSchema.index({ user: 1, job: 1, resume: 1 }, { unique: true });

module.exports = mongoose.model('MatchAnalysis', matchAnalysisSchema);
