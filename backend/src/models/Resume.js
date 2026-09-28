const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  { name: String, description: String, technologies: [String] },
  { _id: false },
);
const experienceSchema = new mongoose.Schema(
  { title: String, organization: String, duration: String, highlights: [String] },
  { _id: false },
);
const educationSchema = new mongoose.Schema(
  { degree: String, institution: String, year: String },
  { _id: false },
);

const resumeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    filename: { type: String, required: true, maxlength: 120 },
    fileSize: { type: Number, required: true },
    pageCount: { type: Number, default: 0 },
    // Full text is only returned on the detail endpoint.
    extractedText: { type: String, required: true, select: false },
    textLength: { type: Number, default: 0 },

    // ---- AI / heuristic analysis ----
    analysisStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    analysisMode: { type: String, enum: ['ai', 'heuristic', null], default: null },
    analysisWarnings: { type: [String], default: [] },
    analysisError: { type: String, default: null },
    summary: { type: String, default: '' },
    skills: { type: [String], default: [] },
    technologies: { type: [String], default: [] },
    projects: { type: [projectSchema], default: [] },
    experience: { type: [experienceSchema], default: [] },
    education: { type: [educationSchema], default: [] },
    strengths: { type: [String], default: [] },
    possibleGaps: { type: [String], default: [] },
    analyzedAt: Date,
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

resumeSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Resume', resumeSchema);
