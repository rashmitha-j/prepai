/**
 * Interview orchestration. The backend owns the session state machine:
 *
 *   start ──► question 1 ──► answer ──► evaluate ──┬─► follow-up (if the evaluator asks for one)
 *                  ▲                               └─► next question (adapted to history)
 *                  └────────────────────────────────────────┘
 *   ... until the planned number of main questions is answered ──► complete ──► report
 *
 * Each question is generated only after the previous answer is evaluated, so the next
 * question is influenced by what the candidate actually said.
 */
const InterviewSession = require('../models/InterviewSession');
const InterviewReport = require('../models/InterviewReport');
const JobDescription = require('../models/JobDescription');
const MatchAnalysis = require('../models/MatchAnalysis');
const Resume = require('../models/Resume');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { parsePagination } = require('../utils/helpers');
const aiClient = require('./aiClient');

const MAX_ACTIVE_SESSIONS = 5;

// ------------------------------------------------------------------ helpers
function sourceRefs(sources = []) {
  return sources.map(({ id, title, topic, section, score }) => ({ id, title, topic, section, score }));
}

function currentTurn(session) {
  const last = session.turns[session.turns.length - 1];
  return last && last.answer === null ? last : null;
}

function answeredTurns(session) {
  return session.turns.filter((t) => t.answer !== null && t.evaluation);
}

function mainAsked(session) {
  return session.turns.filter((t) => !t.isFollowUp).length;
}

function followUpsUsed(session) {
  return session.turns.filter((t) => t.isFollowUp).length;
}

function isFinished(session) {
  return !currentTurn(session) && mainAsked(session) >= session.totalQuestions;
}

/** Client view: expected points are hidden for the unanswered question. */
function toClient(session) {
  const obj = session.toJSON();
  obj.turns = obj.turns.map((t) => {
    if (t.answer === null) {
      const { expectedPoints: _hidden, ...rest } = t;
      return rest;
    }
    return t;
  });
  delete obj.usedSourceIds;
  obj.progress = {
    answered: answeredTurns(session).length,
    mainAsked: mainAsked(session),
    totalQuestions: session.totalQuestions,
    followUpsUsed: followUpsUsed(session),
    canComplete: session.status === 'in_progress' && answeredTurns(session).length > 0,
    awaitingNextQuestion: session.status === 'in_progress' && !currentTurn(session) && !isFinished(session),
    finished: isFinished(session),
  };
  return obj;
}

function plainContext(session) {
  const ctx = session.toObject({ depopulate: true }).context || {};
  const out = {};
  for (const key of ['resumeSummary', 'resumeSkills', 'resumeProjects', 'jobTitle', 'jobSummary', 'jobSkills', 'missingSkills']) {
    if (ctx[key] !== undefined && ctx[key] !== null) out[key] = ctx[key];
  }
  return out;
}

function plainScores(evaluation) {
  const scores = evaluation?.toObject ? evaluation.toObject().scores : evaluation?.scores;
  return Object.fromEntries(Object.entries(scores || {}).filter(([, v]) => typeof v === 'number'));
}

function historyFor(session) {
  return answeredTurns(session)
    .slice(-8)
    .map((t) => ({
      question: t.question.slice(0, 2000),
      topic: (t.topic || '').slice(0, 200),
      answerExcerpt: (t.answer || '').slice(0, 600),
      score: t.evaluation?.overallScore ?? null,
      missingPoints: (t.evaluation?.missingPoints || []).slice(0, 5),
    }));
}

function pushTurn(session, q, { isFollowUp = false, parentIndex = null } = {}) {
  session.turns.push({
    index: session.turns.length,
    question: q.question,
    topic: q.topic,
    category: q.category,
    expectedPoints: q.expectedPoints || [],
    rationale: q.rationale || '',
    isFollowUp,
    parentIndex,
    sources: sourceRefs(q.sources),
    askedAt: new Date(),
  });
  for (const s of q.sources || []) {
    if (!session.usedSourceIds.includes(s.id)) session.usedSourceIds.push(s.id);
  }
}

async function generateMainQuestion(session) {
  const q = await aiClient.generateQuestion({
    role: session.role,
    difficulty: session.difficulty,
    category: session.category,
    context: plainContext(session),
    history: historyFor(session),
    questionNumber: mainAsked(session) + 1,
    totalQuestions: session.totalQuestions,
    excludeSourceIds: session.usedSourceIds.slice(-60),
  });
  pushTurn(session, q);
}

async function buildContext(userId, resumeId, jobId) {
  const [resume, job] = await Promise.all([
    resumeId ? Resume.findOne({ _id: resumeId, user: userId }) : null,
    jobId ? JobDescription.findOne({ _id: jobId, user: userId }) : null,
  ]);
  if (resumeId && !resume) throw AppError.notFound('Resume');
  if (jobId && !job) throw AppError.notFound('Job description');

  let missingSkills = [];
  if (resume && job) {
    const match = await MatchAnalysis.findOne({ user: userId, resume: resume._id, job: job._id }).lean();
    missingSkills = match?.missingSkills || [];
  }
  return {
    resume,
    job,
    context: {
      resumeSummary: (resume?.summary || '').slice(0, 3000),
      resumeSkills: [...new Set([...(resume?.skills || []), ...(resume?.technologies || [])])].slice(0, 80),
      resumeProjects: (resume?.projects || []).slice(0, 12).map((p) =>
        `${p.name}${p.technologies?.length ? ` (${p.technologies.slice(0, 5).join(', ')})` : ''}`.slice(0, 300)),
      jobTitle: (job?.title || '').slice(0, 200),
      jobSummary: (job?.summary || '').slice(0, 3000),
      jobSkills: [...new Set([...(job?.requiredSkills || []), ...(job?.technologies || [])])].slice(0, 80),
      missingSkills: missingSkills.slice(0, 40),
    },
  };
}

// ------------------------------------------------------------------ operations
async function startInterview(user, input) {
  const active = await InterviewSession.countDocuments({ user: user._id, status: 'in_progress' });
  if (active >= MAX_ACTIVE_SESSIONS) {
    throw AppError.conflict(`You have ${active} unfinished interviews. Complete or abandon one before starting another.`);
  }
  if (input.category === 'resume' && !input.resumeId) {
    throw AppError.validation('Select a resume for resume/project questions.');
  }
  const { resume, job, context } = await buildContext(user._id, input.resumeId, input.jobId);

  const session = new InterviewSession({
    user: user._id,
    resume: resume?._id || null,
    job: job?._id || null,
    role: input.role,
    difficulty: input.difficulty,
    category: input.category,
    totalQuestions: input.totalQuestions,
    maxFollowUps: Math.min(3, Math.ceil(input.totalQuestions / 2)),
    context,
  });
  // Only persist the session once the first question exists, so a provider outage does
  // not leave empty sessions behind.
  await generateMainQuestion(session);
  await session.save();
  return toClient(session);
}

async function getSessionDoc(userId, id) {
  const session = await InterviewSession.findOne({ _id: id, user: userId });
  if (!session) throw AppError.notFound('Interview');
  return session;
}

async function getInterview(userId, id) {
  return toClient(await getSessionDoc(userId, id));
}

async function listInterviews(userId, query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 10 });
  const filter = { user: userId };
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    InterviewSession.find(filter)
      .select('role difficulty category status averageScore totalQuestions startedAt completedAt createdAt job report turns.index')
      .populate('job', 'title company')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InterviewSession.countDocuments(filter),
  ]);
  return {
    items: items.map(({ turns, ...rest }) => ({ ...rest, questionCount: turns?.length || 0 })),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Evaluate the current answer, then decide what comes next:
 *   follow-up (evaluator suggested one, budget left, current turn is not already a follow-up)
 *   → otherwise next main question → otherwise the interview is ready to complete.
 * If generating the next question fails, the evaluation is still saved and the client
 * can retry with POST /:id/next.
 */
async function submitAnswer(userId, id, answer) {
  const session = await getSessionDoc(userId, id);
  if (session.status !== 'in_progress') throw AppError.conflict('This interview is no longer in progress.');
  const turn = currentTurn(session);
  if (!turn) throw AppError.conflict('There is no open question. Request the next question or complete the interview.');

  const ev = await aiClient.evaluateAnswer({
    role: session.role,
    difficulty: session.difficulty,
    category: turn.category || session.category,
    question: turn.question,
    topic: turn.topic || '',
    expectedPoints: (turn.expectedPoints || []).slice(0, 10),
    answer,
  });

  turn.answer = answer;
  turn.answeredAt = new Date();
  turn.evaluation = {
    scores: ev.scores,
    overallScore: ev.overallScore,
    summary: ev.summary,
    strengths: ev.strengths,
    missingPoints: ev.missingPoints,
    suggestions: ev.suggestions,
    modelAnswer: ev.modelAnswer,
    followUpSuggested: Boolean(ev.followUp?.shouldAsk),
    sources: sourceRefs(ev.sources),
    evaluatedAt: new Date(),
  };
  await session.save();

  let nextError = null;
  const wantsFollowUp =
    ev.followUp?.shouldAsk && !turn.isFollowUp && followUpsUsed(session) < session.maxFollowUps;
  try {
    if (wantsFollowUp) {
      const fu = await aiClient.generateFollowUp({
        role: session.role,
        difficulty: session.difficulty,
        category: turn.category || session.category,
        question: turn.question,
        topic: turn.topic || '',
        answer,
        missingPoints: (ev.missingPoints || []).slice(0, 10),
        suggestedQuestion: (ev.followUp.question || '').slice(0, 1200),
      });
      pushTurn(session, fu, { isFollowUp: true, parentIndex: turn.index });
    } else if (mainAsked(session) < session.totalQuestions) {
      await generateMainQuestion(session);
    }
    await session.save();
  } catch (err) {
    logger.warn(`Next question generation failed for session ${session.id}: ${err.message}`);
    nextError = err instanceof AppError ? { code: err.code, message: err.message } : { code: 'AI_ERROR', message: 'Could not generate the next question.' };
  }

  const view = toClient(session);
  return {
    session: view,
    evaluation: view.turns[turn.index].evaluation,
    nextQuestion: currentTurn(session) ? view.turns[view.turns.length - 1] : null,
    nextError,
  };
}

/** Retry generating the next question after a transient AI failure. */
async function nextQuestion(userId, id) {
  const session = await getSessionDoc(userId, id);
  if (session.status !== 'in_progress') throw AppError.conflict('This interview is no longer in progress.');
  if (currentTurn(session)) return toClient(session);
  if (isFinished(session)) throw AppError.conflict('All questions have been answered. Complete the interview to see your report.');
  await generateMainQuestion(session);
  await session.save();
  return toClient(session);
}

async function completeInterview(userId, id) {
  const session = await getSessionDoc(userId, id);
  if (session.status === 'completed' && session.report) {
    return { session: toClient(session), report: await InterviewReport.findById(session.report) };
  }
  if (session.status !== 'in_progress') throw AppError.conflict('This interview cannot be completed.');
  const answered = answeredTurns(session);
  if (!answered.length) throw AppError.conflict('Answer at least one question before completing the interview.');

  const result = await aiClient.generateReport({
    role: session.role,
    difficulty: session.difficulty,
    category: session.category,
    context: plainContext(session),
    turns: answered.map((t) => ({
      question: t.question.slice(0, 2000),
      topic: (t.topic || '').slice(0, 200),
      category: t.category || '',
      answerExcerpt: t.answer.slice(0, 1500),
      overallScore: t.evaluation.overallScore,
      scores: plainScores(t.evaluation),
      strengths: (t.evaluation.strengths || []).slice(0, 10),
      missingPoints: (t.evaluation.missingPoints || []).slice(0, 10),
      isFollowUp: t.isFollowUp,
    })),
  });

  const report = await InterviewReport.findOneAndUpdate(
    { session: session._id },
    {
      $set: {
        user: userId,
        summary: result.summary,
        strengths: result.strengths,
        weakAreas: result.weakAreas,
        technicalGaps: result.technicalGaps,
        communicationFeedback: result.communicationFeedback,
        recommendedTopics: result.recommendedTopics,
        roadmap: result.roadmap,
        averageScore: result.averageScore,
        dimensionAverages: result.dimensionAverages,
        topicScores: result.topicScores,
        sources: sourceRefs(result.sources),
        analysisMode: result.analysisMode,
        warnings: result.warnings,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  // Drop an unanswered trailing question; it is not part of the assessment.
  if (currentTurn(session)) session.turns.pop();
  session.status = 'completed';
  session.completedAt = new Date();
  session.averageScore = result.averageScore;
  session.report = report._id;
  await session.save();
  return { session: toClient(session), report };
}

async function abandonInterview(userId, id) {
  const session = await getSessionDoc(userId, id);
  if (session.status !== 'in_progress') throw AppError.conflict('Only in-progress interviews can be abandoned.');
  session.status = 'abandoned';
  await session.save();
  return toClient(session);
}

async function getReport(userId, id) {
  const session = await getSessionDoc(userId, id);
  const report = await InterviewReport.findOne({ session: session._id, user: userId });
  if (!report) throw AppError.notFound('Report');
  return { session: toClient(session), report };
}

async function deleteInterview(userId, id) {
  const session = await getSessionDoc(userId, id);
  await InterviewReport.deleteMany({ session: session._id, user: userId });
  await session.deleteOne();
}

module.exports = {
  startInterview,
  getInterview,
  listInterviews,
  submitAnswer,
  nextQuestion,
  completeInterview,
  abandonInterview,
  getReport,
  deleteInterview,
  MAX_ACTIVE_SESSIONS,
};
