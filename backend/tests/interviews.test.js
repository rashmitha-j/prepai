jest.mock('../src/services/aiClient');

const db = require('./helpers/db');
const { app, request, registerUser } = require('./helpers/api');
const fixtures = require('./helpers/aiFixtures');
const aiClient = require('../src/services/aiClient');
const AppError = require('../src/utils/AppError');
const InterviewSession = require('../src/models/InterviewSession');

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(() => {
  jest.resetAllMocks();
  aiClient.generateQuestion.mockImplementation(async () => fixtures.question());
  aiClient.evaluateAnswer.mockResolvedValue(fixtures.evaluation({ score: 7 }));
  aiClient.generateFollowUp.mockImplementation(async () => fixtures.question({ isFollowUp: true, topic: 'Lock ordering', sources: [] }));
  aiClient.generateReport.mockResolvedValue(fixtures.report);
});

const START = { role: 'Backend Developer', difficulty: 'medium', category: 'os', totalQuestions: 2 };

async function start(auth, body = START) {
  const res = await request(app).post('/api/interviews').set(auth).send(body);
  expect(res.status).toBe(201);
  return res.body.interview;
}

describe('starting an interview', () => {
  it('generates only the first question and hides its expected points', async () => {
    const { auth } = await registerUser();
    const interview = await start(auth);
    expect(interview.status).toBe('in_progress');
    expect(interview.turns).toHaveLength(1);
    expect(interview.turns[0].question).toMatch(/deadlock/);
    expect(interview.turns[0].expectedPoints).toBeUndefined();
    expect(interview.turns[0].sources[0].title).toBe('Operating Systems');
    expect(interview.progress).toMatchObject({ answered: 0, mainAsked: 1, totalQuestions: 2, canComplete: false });
    expect(aiClient.generateQuestion).toHaveBeenCalledTimes(1);
    expect(aiClient.generateQuestion.mock.calls[0][0]).toMatchObject({ role: 'Backend Developer', category: 'os', questionNumber: 1, history: [] });
  });

  it('validates input', async () => {
    const { auth } = await registerUser();
    for (const body of [
      { ...START, category: 'astrology' },
      { ...START, difficulty: 'extreme' },
      { ...START, totalQuestions: 50 },
      { ...START, role: '' },
      { ...START, resumeId: 'nope' },
    ]) {
      expect((await request(app).post('/api/interviews').set(auth).send(body)).status).toBe(422);
    }
    expect((await request(app).post('/api/interviews').set(auth).send({ ...START, category: 'resume' })).status).toBe(422);
  });

  it('does not persist a session when the AI provider is unavailable', async () => {
    aiClient.generateQuestion.mockRejectedValue(new AppError(503, 'AI_PROVIDER_UNAVAILABLE', 'Cannot reach Ollama'));
    const { auth, user } = await registerUser();
    const res = await request(app).post('/api/interviews').set(auth).send(START);
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Cannot reach Ollama');
    expect(await InterviewSession.countDocuments({ user: user._id })).toBe(0);
  });

  it('rejects resumes/jobs that belong to another user', async () => {
    const { auth } = await registerUser();
    const res = await request(app).post('/api/interviews').set(auth).send({ ...START, resumeId: '0123456789abcdef01234567' });
    expect(res.status).toBe(404);
  });
});

describe('interactive interview flow', () => {
  it('evaluates answers, asks an adaptive follow-up, continues, and completes with a report', async () => {
    const { auth } = await registerUser();
    const interview = await start(auth);

    // Answer 1 -> evaluator suggests a follow-up
    aiClient.evaluateAnswer.mockResolvedValueOnce(fixtures.evaluation({ score: 5, followUp: true }));
    const a1 = await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'Deadlock is when threads wait forever on each other.' });
    expect(a1.status).toBe(200);
    expect(a1.body.evaluation.overallScore).toBe(5);
    expect(a1.body.evaluation.missingPoints).toEqual(['Lock ordering']);
    expect(a1.body.nextQuestion.isFollowUp).toBe(true);
    expect(a1.body.nextQuestion.parentIndex).toBe(0);
    expect(a1.body.interview.turns[0].expectedPoints).toEqual(['Mutual exclusion', 'Circular wait']); // revealed after answering
    expect(aiClient.generateFollowUp.mock.calls[0][0]).toMatchObject({
      answer: 'Deadlock is when threads wait forever on each other.',
      suggestedQuestion: 'How does lock ordering help?',
    });
    expect(aiClient.generateQuestion).toHaveBeenCalledTimes(1);

    // Answer the follow-up -> next main question, generated with history of previous answers
    const a2 = await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'Acquire locks in a global order.' });
    expect(a2.status).toBe(200);
    expect(a2.body.nextQuestion.isFollowUp).toBe(false);
    const secondCall = aiClient.generateQuestion.mock.calls[1][0];
    expect(secondCall.questionNumber).toBe(2);
    expect(secondCall.history).toHaveLength(2);
    expect(secondCall.history[0]).toMatchObject({ score: 5, missingPoints: ['Lock ordering'] });
    expect(secondCall.history[0].answerExcerpt).toContain('threads wait forever');
    expect(secondCall.excludeSourceIds.length).toBeGreaterThan(0);

    // Answer the last main question -> no more questions
    const a3 = await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'Final answer.' });
    expect(a3.body.nextQuestion).toBeNull();
    expect(a3.body.interview.progress.finished).toBe(true);
    expect(a3.body.interview.progress.canComplete).toBe(true);

    // No open question -> answering again is a conflict
    expect((await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'x' })).status).toBe(409);

    // Complete -> report stored
    const done = await request(app).post(`/api/interviews/${interview._id}/complete`).set(auth);
    expect(done.status).toBe(200);
    expect(done.body.interview.status).toBe('completed');
    expect(done.body.interview.averageScore).toBe(6.5);
    expect(done.body.report.roadmap[0].title).toBe('OS deep dive');
    const reportPayload = aiClient.generateReport.mock.calls[0][0];
    expect(reportPayload.turns).toHaveLength(3);
    expect(reportPayload.turns[1].isFollowUp).toBe(true);

    // Completing twice is idempotent; report endpoint works
    expect((await request(app).post(`/api/interviews/${interview._id}/complete`).set(auth)).status).toBe(200);
    expect(aiClient.generateReport).toHaveBeenCalledTimes(1);
    const report = await request(app).get(`/api/interviews/${interview._id}/report`).set(auth);
    expect(report.status).toBe(200);
    expect(report.body.report.weakAreas).toEqual(['Deadlock prevention']);

    // Cannot answer a completed interview
    expect((await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'late' })).status).toBe(409);
  });

  it('saves the evaluation when next-question generation fails and allows a retry', async () => {
    const { auth } = await registerUser();
    const interview = await start(auth, { ...START, totalQuestions: 3 });
    aiClient.generateQuestion.mockRejectedValueOnce(new AppError(502, 'AI_OUTPUT_INVALID', 'bad output'));
    const a1 = await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'An answer' });
    expect(a1.status).toBe(200);
    expect(a1.body.evaluation.overallScore).toBe(7);
    expect(a1.body.nextQuestion).toBeNull();
    expect(a1.body.nextError.code).toBe('AI_OUTPUT_INVALID');
    expect(a1.body.interview.progress.awaitingNextQuestion).toBe(true);

    const retry = await request(app).post(`/api/interviews/${interview._id}/next`).set(auth);
    expect(retry.status).toBe(200);
    expect(retry.body.interview.turns).toHaveLength(2);
  });

  it('does not save an answer whose evaluation failed', async () => {
    const { auth } = await registerUser();
    const interview = await start(auth);
    aiClient.evaluateAnswer.mockRejectedValueOnce(new AppError(504, 'AI_TIMEOUT', 'too slow'));
    const res = await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'An answer' });
    expect(res.status).toBe(504);
    const again = await request(app).get(`/api/interviews/${interview._id}`).set(auth);
    expect(again.body.interview.turns[0].answer).toBeNull();
  });

  it('rejects empty and oversized answers', async () => {
    const { auth } = await registerUser();
    const interview = await start(auth);
    expect((await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: '   ' })).status).toBe(422);
    expect((await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'x'.repeat(8001) })).status).toBe(422);
  });

  it('needs at least one answer before completing, and supports abandon', async () => {
    const { auth } = await registerUser();
    const interview = await start(auth);
    expect((await request(app).post(`/api/interviews/${interview._id}/complete`).set(auth)).status).toBe(409);
    const abandoned = await request(app).post(`/api/interviews/${interview._id}/abandon`).set(auth);
    expect(abandoned.body.interview.status).toBe('abandoned');
  });

  it('completes early, dropping the unanswered question', async () => {
    const { auth } = await registerUser();
    const interview = await start(auth, { ...START, totalQuestions: 5 });
    await request(app).post(`/api/interviews/${interview._id}/answer`).set(auth).send({ answer: 'One answer' });
    const done = await request(app).post(`/api/interviews/${interview._id}/complete`).set(auth);
    expect(done.status).toBe(200);
    expect(done.body.interview.turns).toHaveLength(1);
  });

  it('isolates sessions between users', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const interview = await start(alice.auth);
    expect((await request(app).get(`/api/interviews/${interview._id}`).set(bob.auth)).status).toBe(404);
    expect((await request(app).post(`/api/interviews/${interview._id}/answer`).set(bob.auth).send({ answer: 'hijack' })).status).toBe(404);
    expect((await request(app).get('/api/interviews').set(bob.auth)).body.total).toBe(0);
    const list = await request(app).get('/api/interviews?status=in_progress&limit=5').set(alice.auth);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].questionCount).toBe(1);
  });
});
