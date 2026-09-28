jest.mock('../src/services/aiClient');

const db = require('./helpers/db');
const { app, request, registerUser } = require('./helpers/api');
const fixtures = require('./helpers/aiFixtures');
const aiClient = require('../src/services/aiClient');
const { CodingProblem, CodingSubmission } = require('../src/models');

beforeAll(db.connect);
afterAll(db.disconnect);

describe('GET /api/dashboard', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });

  it('returns empty stats for a new user', async () => {
    const { auth } = await registerUser();
    const res = await request(app).get('/api/dashboard').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ resumes: 0, jobAnalyses: 0, interviewsCompleted: 0, interviewsInProgress: 0 });
    expect(res.body.averageScore).toBeNull();
    expect(res.body.recentInterviews).toEqual([]);
    expect(res.body.weakTopics).toEqual([]);
  });

  it('aggregates interviews, weak topics, recommendations and coding progress per user', async () => {
    aiClient.generateQuestion.mockImplementation(async () => fixtures.question());
    aiClient.evaluateAnswer.mockResolvedValue(fixtures.evaluation({ score: 6 }));
    aiClient.generateReport.mockResolvedValue(fixtures.report);
    aiClient.analyzeJob.mockResolvedValue(fixtures.jobAnalysis);

    const { auth, user } = await registerUser();
    const other = await registerUser();
    await request(app)
      .post('/api/jobs')
      .set(auth)
      .send({ rawText: 'A backend role requiring Node.js, SQL and REST API design experience for a growing team.' });

    const { body } = await request(app).post('/api/interviews').set(auth).send({ role: 'SDE', difficulty: 'easy', category: 'os', totalQuestions: 1 });
    await request(app).post(`/api/interviews/${body.interview._id}/answer`).set(auth).send({ answer: 'answer' });
    await request(app).post(`/api/interviews/${body.interview._id}/complete`).set(auth);
    await request(app).post('/api/interviews').set(auth).send({ role: 'SDE', difficulty: 'easy', category: 'dsa', totalQuestions: 1 });

    const problems = await CodingProblem.insertMany([
      { slug: 'p-easy', title: 'Easy', difficulty: 'easy', description: 'd', starterCode: { cpp: 'int main(){}' }, testCases: [{ input: '1', expectedOutput: '1' }] },
      { slug: 'p-hard', title: 'Hard', difficulty: 'hard', description: 'd', starterCode: { cpp: 'int main(){}' }, testCases: [{ input: '1', expectedOutput: '1' }] },
    ]);
    await CodingSubmission.create([
      { user: user._id, problem: problems[0]._id, code: 'x', verdict: 'wrong_answer' },
      { user: user._id, problem: problems[0]._id, code: 'y', verdict: 'accepted' },
      { user: user._id, problem: problems[1]._id, code: 'z', verdict: 'compile_error' },
      { user: other.user._id, problem: problems[1]._id, code: 'z', verdict: 'accepted' },
    ]);

    const res = await request(app).get('/api/dashboard').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ resumes: 0, jobAnalyses: 1, interviewsCompleted: 1, interviewsInProgress: 1 });
    expect(res.body.averageScore).toBe(6.5);
    expect(res.body.recentInterviews).toHaveLength(2);
    expect(res.body.weakTopics).toEqual([{ topic: 'Deadlocks', averageScore: 5.5, questions: 2 }]);
    expect(res.body.strongTopics[0].topic).toBe('Paging');
    expect(res.body.recommendedTopics).toEqual(['Operating Systems']);
    expect(res.body.scoreTrend).toHaveLength(1);
    expect(res.body.coding).toMatchObject({ solved: 1, attempted: 2, total: 2, submissions: 3 });
    expect(res.body.coding.byDifficulty.easy).toEqual({ solved: 1, total: 1 });
    expect(res.body.coding.byDifficulty.hard).toEqual({ solved: 0, total: 1 });

    const otherDash = await request(app).get('/api/dashboard').set(other.auth);
    expect(otherDash.body.counts.interviewsCompleted).toBe(0);
    expect(otherDash.body.coding.solved).toBe(1);
  });
});
