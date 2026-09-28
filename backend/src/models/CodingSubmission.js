const mongoose = require('mongoose');

const VERDICTS = ['accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit_exceeded', 'output_limit_exceeded', 'internal_error'];

const codingSubmissionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'CodingProblem', required: true },
    language: { type: String, enum: ['cpp'], default: 'cpp' },
    code: { type: String, required: true, maxlength: 20000 },
    verdict: { type: String, enum: VERDICTS, required: true },
    passedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    compileOutput: { type: String, default: '' },
    runtimeMs: { type: Number, default: null },
    // Per-test details. Hidden tests store only status/time — never their data.
    results: [
      {
        _id: false,
        index: Number,
        hidden: Boolean,
        status: String,
        timeMs: Number,
        input: String,
        expectedOutput: String,
        actualOutput: String,
        stderr: String,
      },
    ],
    sandbox: { type: String, default: '' },
    aiExplanation: {
      summary: String,
      likelyIssues: [String],
      timeComplexity: String,
      spaceComplexity: String,
      improvements: [String],
      generatedAt: Date,
    },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

codingSubmissionSchema.index({ user: 1, problem: 1, createdAt: -1 });
codingSubmissionSchema.index({ user: 1, verdict: 1 });

module.exports = mongoose.model('CodingSubmission', codingSubmissionSchema);
module.exports.VERDICTS = VERDICTS;
