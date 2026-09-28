const mongoose = require('mongoose');

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, required: true, maxlength: 200000 },
    expectedOutput: { type: String, required: true, maxlength: 200000 },
    isHidden: { type: Boolean, default: false },
    explanation: { type: String, default: '' },
  },
  { _id: false },
);

const codingProblemSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, match: /^[a-z0-9-]+$/ },
    title: { type: String, required: true, maxlength: 120 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    topics: [String],
    description: { type: String, required: true },
    inputFormat: String,
    outputFormat: String,
    constraints: [String],
    examples: [{ _id: false, input: String, output: String, explanation: String }],
    starterCode: { cpp: { type: String, required: true } },
    testCases: { type: [testCaseSchema], validate: (v) => v.length > 0 },
    timeLimitMs: { type: Number, default: 2000 },
    memoryLimitMb: { type: Number, default: 256 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

codingProblemSchema.index({ difficulty: 1, order: 1 });

/** Public view: hidden test cases are never sent to the client. */
codingProblemSchema.methods.toPublic = function toPublic() {
  const obj = this.toJSON();
  obj.sampleTests = this.testCases.filter((t) => !t.isHidden).map(({ input, expectedOutput }) => ({ input, expectedOutput }));
  obj.totalTests = this.testCases.length;
  delete obj.testCases;
  return obj;
};

module.exports = mongoose.model('CodingProblem', codingProblemSchema);
