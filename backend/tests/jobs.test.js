jest.mock('../src/services/aiClient');

const db = require('./helpers/db');
const { app, request, registerUser } = require('./helpers/api');
const { makePdf, SAMPLE_RESUME_LINES } = require('./helpers/pdf');
const fixtures = require('./helpers/aiFixtures');
const aiClient = require('../src/services/aiClient');
const AppError = require('../src/utils/AppError');

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(() => {
  jest.resetAllMocks();
  aiClient.analyzeResume.mockResolvedValue(fixtures.resumeAnalysis);
  aiClient.analyzeJob.mockResolvedValue(fixtures.jobAnalysis);
  aiClient.analyzeMatch.mockResolvedValue(fixtures.matchAnalysis);
});

const JD = `Junior Full Stack Developer at Nimbus.
Requirements: React, Node.js, SQL, REST APIs. Nice to have: Docker, AWS. 0-2 years of experience.
You will build features end to end and write tests.`;

async function createResume(auth) {
  const res = await request(app).post('/api/resumes').set(auth).attach('resume', makePdf(SAMPLE_RESUME_LINES), { filename: 'cv.pdf', contentType: 'application/pdf' });
  return res.body.resume;
}

describe('job descriptions', () => {
  it('creates and analyses a job description', async () => {
    const { auth } = await registerUser();
    const res = await request(app).post('/api/jobs').set(auth).send({ title: '', company: '', rawText: JD });
    expect(res.status).toBe(201);
    expect(res.body.job).toMatchObject({
      title: 'Junior Full Stack Developer',
      company: 'Nimbus',
      analysisStatus: 'completed',
      experienceLevel: 'entry',
      requiredSkills: ['React', 'Node.js', 'SQL', 'REST APIs'],
    });
    expect(aiClient.analyzeJob).toHaveBeenCalledWith({ text: JD, title: '', company: '' });
  });

  it('keeps user-provided title/company over AI output', async () => {
    const { auth } = await registerUser();
    const res = await request(app).post('/api/jobs').set(auth).send({ title: 'SDE 1', company: 'Acme', rawText: JD });
    expect(res.body.job.title).toBe('SDE 1');
    expect(res.body.job.company).toBe('Acme');
  });

  it('validates the job description', async () => {
    const { auth } = await registerUser();
    expect((await request(app).post('/api/jobs').set(auth).send({ rawText: 'too short' })).status).toBe(422);
    expect((await request(app).post('/api/jobs').set(auth).send({ rawText: 'x'.repeat(30001) })).status).toBe(422);
    expect((await request(app).post('/api/jobs').set(auth).send({ rawText: JD, extra: true })).status).toBe(422);
    expect((await request(app).post('/api/jobs').set(auth).send({ rawText: 12345 })).status).toBe(422);
  });

  it('stores the job even when analysis fails', async () => {
    aiClient.analyzeJob.mockRejectedValue(new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'The AI service is not reachable.'));
    const { auth } = await registerUser();
    const res = await request(app).post('/api/jobs').set(auth).send({ rawText: JD });
    expect(res.status).toBe(201);
    expect(res.body.job.analysisStatus).toBe('failed');
    expect(res.body.job.title).toBe('Untitled role');
  });

  it('enforces ownership', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const { body } = await request(app).post('/api/jobs').set(alice.auth).send({ rawText: JD });
    expect((await request(app).get(`/api/jobs/${body.job._id}`).set(bob.auth)).status).toBe(404);
    expect((await request(app).delete(`/api/jobs/${body.job._id}`).set(bob.auth)).status).toBe(404);
    expect((await request(app).get('/api/jobs').set(bob.auth)).body.jobs).toHaveLength(0);
    expect((await request(app).get(`/api/jobs/${body.job._id}`).set(alice.auth)).status).toBe(200);
  });
});

describe('Interview Preparation Match Analysis', () => {
  it('compares a resume with a job using compact structured profiles', async () => {
    const { auth } = await registerUser();
    const resume = await createResume(auth);
    const { body } = await request(app).post('/api/jobs').set(auth).send({ rawText: JD });
    const res = await request(app).post(`/api/jobs/${body.job._id}/match`).set(auth).send({ resumeId: resume._id });
    expect(res.status).toBe(200);
    expect(res.body.match.missingSkills).toEqual(['SQL', 'REST APIs']);
    expect(res.body.match.coverage.percent).toBe(50);
    expect(res.body.match.resume.filename).toBe('cv.pdf');

    const payload = aiClient.analyzeMatch.mock.calls[0][0];
    expect(payload.resume.skills).toContain('React');
    expect(payload.job.requiredSkills).toContain('SQL');
    expect(JSON.stringify(payload)).not.toContain('Web Development Intern at Acme Corp (3 months), built'); // no raw resume text

    // Re-running replaces the analysis rather than duplicating it.
    await request(app).post(`/api/jobs/${body.job._id}/match`).set(auth).send({ resumeId: resume._id });
    const detail = await request(app).get(`/api/jobs/${body.job._id}`).set(auth);
    expect(detail.body.matches).toHaveLength(1);
  });

  it('does not allow matching another user\'s resume', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const resume = await createResume(alice.auth);
    const { body } = await request(app).post('/api/jobs').set(bob.auth).send({ rawText: JD });
    const res = await request(app).post(`/api/jobs/${body.job._id}/match`).set(bob.auth).send({ resumeId: resume._id });
    expect(res.status).toBe(404);
    expect(aiClient.analyzeMatch).not.toHaveBeenCalled();
  });

  it('surfaces AI provider outages as 503 with an actionable message', async () => {
    aiClient.analyzeMatch.mockRejectedValue(new AppError(503, 'AI_PROVIDER_UNAVAILABLE', 'Cannot reach Ollama at http://localhost:11434. Is `ollama serve` running?'));
    const { auth } = await registerUser();
    const resume = await createResume(auth);
    const { body } = await request(app).post('/api/jobs').set(auth).send({ rawText: JD });
    const res = await request(app).post(`/api/jobs/${body.job._id}/match`).set(auth).send({ resumeId: resume._id });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/ollama serve/);
  });

  it('requires completed analyses', async () => {
    aiClient.analyzeJob.mockRejectedValue(new AppError(503, 'X', 'down'));
    const { auth } = await registerUser();
    const resume = await createResume(auth);
    const { body } = await request(app).post('/api/jobs').set(auth).send({ rawText: JD });
    const res = await request(app).post(`/api/jobs/${body.job._id}/match`).set(auth).send({ resumeId: resume._id });
    expect(res.status).toBe(409);
  });
});
