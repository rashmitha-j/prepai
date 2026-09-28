/**
 * Dashboard statistics. Per-user data is small (tens of documents), so aggregates are
 * computed in application code from lean, projected queries. At larger scale this would
 * move to a MongoDB aggregation pipeline or pre-computed per-user stats.
 */
const models = require('../models');
const { round1 } = require('../utils/helpers');

function mean(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

async function getDashboard(userId) {
  const filter = { user: userId };
  const [resumeCount, jobCount, inProgress, completed, recent, reports, problems, submissions] = await Promise.all([
    models.Resume.countDocuments(filter),
    models.JobDescription.countDocuments(filter),
    models.InterviewSession.countDocuments({ ...filter, status: 'in_progress' }),
    models.InterviewSession.find({ ...filter, status: 'completed' })
      .select('averageScore completedAt role category difficulty')
      .sort({ completedAt: -1 })
      .limit(50)
      .lean(),
    models.InterviewSession.find(filter)
      .select('role category difficulty status averageScore createdAt completedAt totalQuestions')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    models.InterviewReport.find(filter)
      .select('topicScores recommendedTopics weakAreas createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    models.CodingProblem.find().select('difficulty').lean(),
    models.CodingSubmission.find(filter).select('problem verdict').lean(),
  ]);

  // Weak topics: average topic scores across the last 10 reports; lowest first.
  const topicTotals = new Map();
  for (const r of reports) {
    for (const t of r.topicScores || []) {
      const key = t.topic;
      const entry = topicTotals.get(key) || { topic: key, sum: 0, count: 0 };
      entry.sum += t.averageScore * (t.questions || 1);
      entry.count += t.questions || 1;
      topicTotals.set(key, entry);
    }
  }
  const topicAverages = [...topicTotals.values()].map((t) => ({ topic: t.topic, averageScore: round1(t.sum / t.count), questions: t.count }));
  const weakTopics = topicAverages.filter((t) => t.averageScore < 6.5).sort((a, b) => a.averageScore - b.averageScore).slice(0, 6);
  const strongTopics = topicAverages.filter((t) => t.averageScore >= 7.5).sort((a, b) => b.averageScore - a.averageScore).slice(0, 4);

  const recommended = [];
  for (const r of reports) {
    for (const t of r.recommendedTopics || []) {
      if (!recommended.some((x) => x.toLowerCase() === t.toLowerCase())) recommended.push(t);
    }
  }

  // Coding progress
  const difficultyOf = new Map(problems.map((p) => [String(p._id), p.difficulty]));
  const solved = new Set(submissions.filter((s) => s.verdict === 'accepted').map((s) => String(s.problem)));
  const attempted = new Set(submissions.map((s) => String(s.problem)));
  const byDifficulty = { easy: { solved: 0, total: 0 }, medium: { solved: 0, total: 0 }, hard: { solved: 0, total: 0 } };
  for (const p of problems) byDifficulty[p.difficulty].total += 1;
  for (const id of solved) {
    const d = difficultyOf.get(id);
    if (d) byDifficulty[d].solved += 1;
  }

  return {
    counts: {
      resumes: resumeCount,
      jobAnalyses: jobCount,
      interviewsCompleted: completed.length,
      interviewsInProgress: inProgress,
    },
    averageScore: round1(mean(completed.map((s) => s.averageScore))),
    scoreTrend: completed
      .slice(0, 10)
      .reverse()
      .map((s) => ({ date: s.completedAt, score: s.averageScore, role: s.role, category: s.category })),
    recentInterviews: recent,
    weakTopics,
    strongTopics,
    recommendedTopics: recommended.slice(0, 8),
    coding: {
      solved: solved.size,
      attempted: attempted.size,
      total: problems.length,
      submissions: submissions.length,
      byDifficulty,
    },
  };
}

module.exports = { getDashboard };
