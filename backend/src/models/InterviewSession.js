const mongoose = require('mongoose');

const CATEGORIES = [
  'dsa', 'dbms', 'sql', 'os', 'cn', 'oop', 'javascript', 'react', 'node',
  'system-design', 'resume', 'behavioral', 'mixed',
];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const SCORE_KEYS = ['correctness', 'relevance', 'technicalDepth', 'clarity', 'completeness', 'communication'];

const sourceSchema = new mongoose.Schema(
  { id: String, title: String, topic: String, section: String, score: Number },
  { _id: false },
);

const evaluationSchema = new mongoose.Schema(
  {
    scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, { type: Number, min: 0, max: 10 }])),
    overallScore: { type: Number, min: 0, max: 10 },
    summary: String,
    strengths: [String],
    missingPoints: [String],
    suggestions: [String],
    modelAnswer: String,
    followUpSuggested: Boolean,
    sources: [sourceSchema],
    evaluatedAt: Date,
  },
  { _id: false },
);

/**
 * One question/answer/evaluation exchange. Embedded in the session because turns are
 * always read and written together with it and their number is bounded.
 */
const turnSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    question: { type: String, required: true },
    topic: String,
    category: { type: String, enum: CATEGORIES },
    expectedPoints: [String], // hidden from the client until the turn is answered
    rationale: String,
    isFollowUp: { type: Boolean, default: false },
    parentIndex: { type: Number, default: null },
    sources: [sourceSchema],
    askedAt: { type: Date, default: Date.now },
    answer: { type: String, default: null },
    answeredAt: Date,
    evaluation: { type: evaluationSchema, default: null },
  },
  { _id: false },
);

const interviewSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    resume: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', default: null },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'JobDescription', default: null },
    role: { type: String, required: true, trim: true, maxlength: 120 },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    totalQuestions: { type: Number, min: 1, max: 10, required: true },
    maxFollowUps: { type: Number, min: 0, max: 5, default: 2 },
    // Compact snapshot of candidate context used for prompts (not the full resume text).
    context: {
      resumeSummary: String,
      resumeSkills: [String],
      resumeProjects: [String],
      jobTitle: String,
      jobSummary: String,
      jobSkills: [String],
      missingSkills: [String],
    },
    turns: { type: [turnSchema], default: [] },
    usedSourceIds: { type: [String], default: [] },
    status: { type: String, enum: ['in_progress', 'completed', 'abandoned'], default: 'in_progress' },
    averageScore: { type: Number, default: null },
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'InterviewReport', default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

interviewSessionSchema.index({ user: 1, createdAt: -1 });
interviewSessionSchema.index({ user: 1, status: 1, completedAt: -1 });

interviewSessionSchema.virtual('mainQuestionsAsked').get(function mainAsked() {
  return this.turns.filter((t) => !t.isFollowUp).length;
});

module.exports = mongoose.model('InterviewSession', interviewSessionSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.DIFFICULTIES = DIFFICULTIES;
module.exports.SCORE_KEYS = SCORE_KEYS;
