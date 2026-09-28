const mongoose = require('mongoose');

const jobDescriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 200, default: '' },
    company: { type: String, trim: true, maxlength: 200, default: '' },
    rawText: { type: String, required: true, maxlength: 30000 },

    analysisStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    analysisMode: { type: String, enum: ['ai', 'heuristic', null], default: null },
    analysisWarnings: { type: [String], default: [] },
    analysisError: { type: String, default: null },
    summary: { type: String, default: '' },
    requiredSkills: { type: [String], default: [] },
    preferredSkills: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    technologies: { type: [String], default: [] },
    experienceLevel: {
      type: String,
      enum: ['intern', 'entry', 'mid', 'senior', 'lead', 'unspecified'],
      default: 'unspecified',
    },
    analyzedAt: Date,
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

jobDescriptionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('JobDescription', jobDescriptionSchema);
