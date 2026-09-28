const CodingProblem = require('../models/CodingProblem');
const CodingSubmission = require('../models/CodingSubmission');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const aiClient = require('./aiClient');
const codeRunner = require('./codeRunner');

async function listProblems(userId) {
  const [problems, submissions] = await Promise.all([
    CodingProblem.find().select('slug title difficulty topics order').sort({ order: 1, title: 1 }).lean(),
    CodingSubmission.find({ user: userId }).select('problem verdict').lean(),
  ]);
  const status = new Map();
  for (const s of submissions) {
    const key = String(s.problem);
    if (s.verdict === 'accepted') status.set(key, 'solved');
    else if (!status.has(key)) status.set(key, 'attempted');
  }
  return problems.map((p) => ({ ...p, status: status.get(String(p._id)) || 'todo' }));
}

async function findProblem(slug) {
  const problem = await CodingProblem.findOne({ slug });
  if (!problem) throw AppError.notFound('Problem');
  return problem;
}

async function getProblem(slug) {
  return (await findProblem(slug)).toPublic();
}

/**
 * mode=run   → only the visible sample tests, nothing stored (quick feedback loop)
 * mode=submit → all tests including hidden ones, stored as a submission
 */
async function submit(userId, slug, { code, mode }) {
  const problem = await findProblem(slug);
  const tests = mode === 'run' ? problem.testCases.filter((t) => !t.isHidden) : problem.testCases;
  const outcome = await codeRunner.judgeCpp({
    code,
    tests: tests.map((t) => ({ input: t.input, expectedOutput: t.expectedOutput, isHidden: t.isHidden })),
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
  });
  if (mode === 'run') return { mode, ...outcome };

  const submission = await CodingSubmission.create({
    user: userId,
    problem: problem._id,
    language: 'cpp',
    code,
    verdict: outcome.verdict,
    passedCount: outcome.passedCount,
    totalCount: outcome.totalCount,
    compileOutput: outcome.compileOutput,
    runtimeMs: outcome.runtimeMs,
    results: outcome.results,
    sandbox: outcome.sandbox,
  });
  return { mode, submissionId: submission.id, ...outcome };
}

async function listSubmissions(userId, slug) {
  const problem = await findProblem(slug);
  return CodingSubmission.find({ user: userId, problem: problem._id })
    .select('verdict passedCount totalCount runtimeMs createdAt')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}

async function getSubmission(userId, id) {
  const submission = await CodingSubmission.findOne({ _id: id, user: userId }).populate('problem', 'slug title difficulty');
  if (!submission) throw AppError.notFound('Submission');
  return submission;
}

async function explainSubmission(userId, id) {
  const submission = await CodingSubmission.findOne({ _id: id, user: userId });
  if (!submission) throw AppError.notFound('Submission');
  if (submission.aiExplanation?.generatedAt) return submission;
  const problem = await CodingProblem.findById(submission.problem);
  if (!problem) throw AppError.notFound('Problem');

  const failedTests = submission.results
    .filter((r) => !r.hidden && r.status !== 'passed' && r.status !== 'skipped')
    .slice(0, 3)
    .map((r) => ({ input: r.input, expected: r.expectedOutput, actual: r.actualOutput, status: r.status }));
  const explanation = await aiClient.explainCode({
    problemTitle: problem.title,
    problemDescription: problem.description.slice(0, 6000),
    language: 'cpp',
    code: submission.code,
    verdict: submission.verdict,
    compileError: submission.verdict === 'compile_error' ? submission.compileOutput.slice(0, 4000) : '',
    failedTests,
  });
  submission.aiExplanation = { ...explanation, generatedAt: new Date() };
  await submission.save();
  logger.debug(`AI explanation stored for submission ${submission.id}`);
  return submission;
}

module.exports = { listProblems, getProblem, submit, listSubmissions, getSubmission, explainSubmission };
