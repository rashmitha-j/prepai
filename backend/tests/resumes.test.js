jest.mock('../src/services/aiClient');

const fs = require('node:fs');
const db = require('./helpers/db');
const { app, request, registerUser } = require('./helpers/api');
const { makePdf, SAMPLE_RESUME_LINES } = require('./helpers/pdf');
const fixtures = require('./helpers/aiFixtures');
const aiClient = require('../src/services/aiClient');
const AppError = require('../src/utils/AppError');
const { UPLOAD_DIR } = require('../src/middleware/upload');
const Resume = require('../src/models/Resume');

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(() => {
  jest.resetAllMocks();
  aiClient.analyzeResume.mockResolvedValue(fixtures.resumeAnalysis);
});

const pdf = makePdf(SAMPLE_RESUME_LINES);
const upload = (auth, buffer, filename = 'resume.pdf', contentType = 'application/pdf') =>
  request(app).post('/api/resumes').set(auth).attach('resume', buffer, { filename, contentType });

const tempFiles = () => fs.readdirSync(UPLOAD_DIR).filter((f) => f.endsWith('.upload'));

describe('resume upload', () => {
  it('extracts text from a real PDF, stores AI analysis and cleans up temp files', async () => {
    const { auth } = await registerUser();
    const res = await upload(auth, pdf, '../../etc/My Resume<script>.pdf');
    expect(res.status).toBe(201);
    const { resume } = res.body;
    expect(resume.analysisStatus).toBe('completed');
    expect(resume.analysisMode).toBe('ai');
    expect(resume.skills).toContain('React');
    expect(resume.projects[0].name).toBe('DevConnect');
    expect(resume.filename).toBe('My Resume_script_.pdf');
    expect(resume.extractedText).toBeUndefined();
    expect(tempFiles()).toHaveLength(0);

    const sentText = aiClient.analyzeResume.mock.calls[0][0];
    expect(sentText).toContain('DevConnect');
    expect(sentText).toContain('Skills: JavaScript, React');

    const stored = await Resume.findById(resume._id).select('+extractedText');
    expect(stored.extractedText).toContain('Web Development Intern');
  });

  it('keeps the upload when the AI provider is unavailable and records the error', async () => {
    aiClient.analyzeResume.mockRejectedValue(new AppError(503, 'AI_PROVIDER_UNAVAILABLE', 'Cannot reach Ollama'));
    const { auth } = await registerUser();
    const res = await upload(auth, pdf);
    expect(res.status).toBe(201);
    expect(res.body.resume.analysisStatus).toBe('failed');
    expect(res.body.resume.analysisError).toBe('Cannot reach Ollama');

    aiClient.analyzeResume.mockResolvedValue(fixtures.resumeAnalysis);
    const again = await request(app).post(`/api/resumes/${res.body.resume._id}/reanalyze`).set(auth);
    expect(again.status).toBe(200);
    expect(again.body.resume.analysisStatus).toBe('completed');
  });

  it('rejects non-PDF content even with a .pdf name and PDF MIME type (signature check)', async () => {
    const { auth } = await registerUser();
    const res = await upload(auth, Buffer.from('#!/bin/sh\necho not a pdf\n'.repeat(20)), 'evil.pdf');
    expect(res.status).toBe(415);
    expect(tempFiles()).toHaveLength(0);
    expect(aiClient.analyzeResume).not.toHaveBeenCalled();
  });

  it('rejects wrong extensions or MIME types', async () => {
    const { auth } = await registerUser();
    expect((await upload(auth, pdf, 'resume.docx')).status).toBe(415);
    expect((await upload(auth, pdf, 'resume.pdf', 'text/plain')).status).toBe(415);
  });

  it('rejects a PDF without extractable text', async () => {
    const { auth } = await registerUser();
    const res = await upload(auth, makePdf(['']));
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/readable text/);
    expect(tempFiles()).toHaveLength(0);
  });

  it('rejects corrupt PDFs', async () => {
    const { auth } = await registerUser();
    const corrupt = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 0x41)]);
    const res = await upload(auth, corrupt);
    expect(res.status).toBe(422);
  });

  it('enforces the file size limit', async () => {
    const { auth } = await registerUser();
    const big = Buffer.concat([pdf, Buffer.alloc(6 * 1024 * 1024, 0x20)]);
    const res = await upload(auth, big);
    expect(res.status).toBe(413);
    expect(tempFiles()).toHaveLength(0);
  });

  it('requires a file and authentication', async () => {
    const { auth } = await registerUser();
    expect((await request(app).post('/api/resumes').set(auth)).status).toBe(400);
    expect((await request(app).post('/api/resumes').attach('resume', pdf, 'r.pdf')).status).toBe(401);
  });
});

describe('resume access control', () => {
  it('lists only own resumes without full text and hides other users\' resumes (404)', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const { body } = await upload(alice.auth, pdf);
    const id = body.resume._id;

    const list = await request(app).get('/api/resumes').set(alice.auth);
    expect(list.body.resumes).toHaveLength(1);
    expect(list.body.resumes[0].extractedText).toBeUndefined();
    expect((await request(app).get('/api/resumes').set(bob.auth)).body.resumes).toHaveLength(0);

    const own = await request(app).get(`/api/resumes/${id}`).set(alice.auth);
    expect(own.status).toBe(200);
    expect(own.body.resume.extractedText).toContain('DevConnect');

    expect((await request(app).get(`/api/resumes/${id}`).set(bob.auth)).status).toBe(404);
    expect((await request(app).delete(`/api/resumes/${id}`).set(bob.auth)).status).toBe(404);
    expect((await request(app).get('/api/resumes/not-an-id').set(alice.auth)).status).toBe(422);

    expect((await request(app).delete(`/api/resumes/${id}`).set(alice.auth)).status).toBe(204);
    expect((await request(app).get(`/api/resumes/${id}`).set(alice.auth)).status).toBe(404);
  });
});
