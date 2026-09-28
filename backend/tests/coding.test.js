jest.mock('../src/services/aiClient');

const fs = require('node:fs');
const path = require('node:path');
const db = require('./helpers/db');
const { app, request, registerUser } = require('./helpers/api');
const aiClient = require('../src/services/aiClient');
const CodingProblem = require('../src/models/CodingProblem');
const CodingSubmission = require('../src/models/CodingSubmission');
const { detectCapabilities } = require('../src/services/codeRunner');

const problems = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/seed/problems.json'), 'utf8'));
const solution = (slug) => fs.readFileSync(path.join(__dirname, 'fixtures/solutions', `${slug}.cpp`), 'utf8');
const hasCompiler = detectCapabilities().gpp;
const itIfCompiler = hasCompiler ? it : it.skip;

beforeAll(async () => {
  await db.connect();
  await CodingProblem.insertMany(problems.filter((p) => ['two-sum', 'valid-parentheses', 'maximum-subarray'].includes(p.slug)));
});
afterAll(db.disconnect);
beforeEach(() => jest.resetAllMocks());

const submit = (auth, slug, code, mode = 'submit') =>
  request(app).post(`/api/coding/problems/${slug}/submit`).set(auth).send({ code, mode, language: 'cpp' });

describe('problems API', () => {
  it('lists problems with per-user status', async () => {
    const { auth } = await registerUser();
    const res = await request(app).get('/api/coding/problems').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.problems.map((p) => p.slug)).toEqual(['two-sum', 'valid-parentheses', 'maximum-subarray']);
    expect(res.body.problems.every((p) => p.status === 'todo')).toBe(true);
    expect(res.body.problems[0].testCases).toBeUndefined();
  });

  it('never exposes hidden test cases', async () => {
    const { auth } = await registerUser();
    const res = await request(app).get('/api/coding/problems/two-sum').set(auth);
    expect(res.status).toBe(200);
    const { problem } = res.body;
    expect(problem.testCases).toBeUndefined();
    expect(problem.sampleTests).toHaveLength(2);
    expect(problem.totalTests).toBeGreaterThan(problem.sampleTests.length);
    expect(problem.starterCode.cpp).toContain('twoSum');
    const hidden = problems.find((p) => p.slug === 'two-sum').testCases.filter((t) => t.isHidden);
    expect(JSON.stringify(res.body)).not.toContain(hidden[hidden.length - 1].input.slice(0, 40));
  });

  it('validates slugs and payloads', async () => {
    const { auth } = await registerUser();
    expect((await request(app).get('/api/coding/problems/..%2F..%2Fetc').set(auth)).status).toBe(422);
    expect((await request(app).get('/api/coding/problems/does-not-exist').set(auth)).status).toBe(404);
    expect((await submit(auth, 'two-sum', '')).status).toBe(422);
    expect((await request(app).post('/api/coding/problems/two-sum/submit').set(auth).send({ code: 'x', language: 'python' })).status).toBe(422);
    expect((await submit(auth, 'two-sum', 'x'.repeat(20001))).status).toBe(422);
  });
});

describe('judge (sandboxed C++ execution)', () => {
  itIfCompiler('accepts a correct solution and stores the submission', async () => {
    const { auth } = await registerUser();
    const res = await submit(auth, 'two-sum', solution('two-sum'));
    expect(res.status).toBe(200);
    const { result } = res.body;
    expect(result.verdict).toBe('accepted');
    expect(result.passedCount).toBe(result.totalCount);
    expect(result.runtimeMs).toEqual(expect.any(Number));
    expect(result.results.filter((r) => r.hidden).every((r) => r.input === undefined && r.expectedOutput === undefined)).toBe(true);
    expect(await CodingSubmission.countDocuments()).toBeGreaterThan(0);

    const list = await request(app).get('/api/coding/problems').set(auth);
    expect(list.body.problems.find((p) => p.slug === 'two-sum').status).toBe('solved');
  });

  itIfCompiler('run mode only uses sample tests and stores nothing', async () => {
    const { auth, user } = await registerUser();
    const res = await submit(auth, 'valid-parentheses', solution('valid-parentheses'), 'run');
    expect(res.body.result.verdict).toBe('accepted');
    expect(res.body.result.totalCount).toBe(2);
    expect(res.body.result.submissionId).toBeUndefined();
    expect(await CodingSubmission.countDocuments({ user: user._id })).toBe(0);
  });

  itIfCompiler('reports wrong answers with visible diffs and skips the rest', async () => {
    const { auth } = await registerUser();
    const starter = problems.find((p) => p.slug === 'maximum-subarray').starterCode.cpp;
    const { result } = (await submit(auth, 'maximum-subarray', starter)).body;
    expect(result.verdict).toBe('wrong_answer');
    expect(result.results[0]).toMatchObject({ status: 'wrong_answer', expectedOutput: '6\n', actualOutput: '0\n' });
    expect(result.results.at(-1).status).toBe('skipped');
  });

  itIfCompiler('reports compile errors without leaking server paths', async () => {
    const { auth } = await registerUser();
    const { result } = (await submit(auth, 'two-sum', 'int main() { this is not c++ }')).body;
    expect(result.verdict).toBe('compile_error');
    expect(result.compileOutput).toMatch(/error/);
    expect(result.compileOutput).not.toMatch(/prepai-judge-/);
  });

  itIfCompiler('kills infinite loops (time limit exceeded)', async () => {
    const { auth } = await registerUser();
    const started = Date.now();
    const { result } = (await submit(auth, 'two-sum', 'int main(){ volatile unsigned long x = 0; while (true) { x++; } }', 'run')).body;
    expect(result.verdict).toBe('time_limit_exceeded');
    expect(Date.now() - started).toBeLessThan(15000);
  });

  itIfCompiler('detects runtime errors', async () => {
    const { auth } = await registerUser();
    const { result } = (await submit(auth, 'two-sum', '#include <cstdlib>\nint main(){ std::abort(); }', 'run')).body;
    expect(result.verdict).toBe('runtime_error');
  });

  itIfCompiler('limits output size', async () => {
    const { auth } = await registerUser();
    const code = '#include <cstdio>\nint main(){ for(;;) std::puts("spam spam spam spam spam spam spam spam"); }';
    const { result } = (await submit(auth, 'two-sum', code, 'run')).body;
    expect(result.verdict).toBe('output_limit_exceeded');
  });

  itIfCompiler('limits memory', async () => {
    const { auth } = await registerUser();
    const code = '#include <vector>\n#include <cstdio>\nint main(){ std::vector<char> v(1024ull*1024*1024, 1); std::printf("%d", (int)v[12345]); }';
    const { result } = (await submit(auth, 'two-sum', code, 'run')).body;
    if (detectCapabilities().prlimit) expect(result.verdict).toBe('runtime_error');
    else expect(['runtime_error', 'wrong_answer']).toContain(result.verdict);
  });

  itIfCompiler('blocks network access when a network namespace is available', async () => {
    if (!detectCapabilities().unshare) return;
    const { auth } = await registerUser();
    const code = `#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <cstdio>
int main(){ int s = socket(AF_INET, SOCK_STREAM, 0); sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(53);
inet_pton(AF_INET, "1.1.1.1", &a.sin_addr); int r = connect(s, (sockaddr*)&a, sizeof a); std::printf(r == 0 ? "connected" : "blocked"); }`;
    const { result } = (await submit(auth, 'two-sum', code, 'run')).body;
    expect(result.results[0].actualOutput).toBe('blocked');
  });

  itIfCompiler('asks the AI to explain a submission and caches the explanation', async () => {
    aiClient.explainCode.mockResolvedValue({ summary: 'Returns 0 always.', likelyIssues: ['Not implemented'], timeComplexity: 'O(1)', spaceComplexity: 'O(1)', improvements: ['Use Kadane'] });
    const { auth } = await registerUser();
    const starter = problems.find((p) => p.slug === 'maximum-subarray').starterCode.cpp;
    const { result } = (await submit(auth, 'maximum-subarray', starter)).body;
    const res = await request(app).post(`/api/coding/submissions/${result.submissionId}/explain`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.explanation.summary).toBe('Returns 0 always.');
    const payload = aiClient.explainCode.mock.calls[0][0];
    expect(payload.verdict).toBe('wrong_answer');
    expect(payload.failedTests[0]).toMatchObject({ expected: '6\n', actual: '0\n' });
    await request(app).post(`/api/coding/submissions/${result.submissionId}/explain`).set(auth);
    expect(aiClient.explainCode).toHaveBeenCalledTimes(1);

    const other = await registerUser();
    expect((await request(app).get(`/api/coding/submissions/${result.submissionId}`).set(other.auth)).status).toBe(404);
  });
});
