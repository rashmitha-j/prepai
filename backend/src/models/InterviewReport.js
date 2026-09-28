const mongoose = require('mongoose');

const interviewReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'InterviewSession', required: true, unique: true },
    summary: String,
    strengths: [String],
    weakAreas: [String],
    technicalGaps: [String],
    communicationFeedback: String,
    recommendedTopics: [String],
    roadmap: [{ _id: false, title: String, focus: String, actions: [String], duration: String }],
    averageScore: { type: Number, default: null },
    dimensionAverages: { type: Map, of: Number, default: {} },
    topicScores: [{ _id: false, topic: String, averageScore: Number, questions: Number }],
    sources: [{ _id: false, id: String, title: String, topic: String, section: String, score: Number }],
    analysisMode: { type: String, enum: ['ai', 'heuristic'], default: 'ai' },
    warnings: [String],
  },
  { timestamps: true, toJSON: { versionKey: false, flattenMaps: true } },
);

interviewReportSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('InterviewReport', interviewReportSchema);
