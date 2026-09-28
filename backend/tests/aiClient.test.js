/**
 * aiClient against an in-process fake AI service (real HTTP), covering error translation:
 * provider outages, invalid model output, auth misconfiguration, timeouts, unreachable.
 */
const http = require('node:http');

let server;
let port;
let behaviour = () => ({ status: 200, body: {} });
let lastRequest;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      lastRequest = { method: req.method, url: req.url, headers: req.headers, body: data ? JSON.parse(data) : null };
      const out = behaviour(lastRequest);
      if (out.hang) return; // simulate a model that never answers
      res.writeHead(out.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  process.env.AI_SERVICE_URL = `http://127.0.0.1:${port}`;
  process.env.AI_REQUEST_TIMEOUT_MS = '800';
  jest.resetModules();
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

const client = () => require('../src/services/aiClient');

it('sends the internal token and JSON payload', async () => {
  behaviour = () => ({ status: 200, body: { analysisMode: 'ai', skills: ['React'] } });
  const out = await client().analyzeResume('resume text');
  expect(out.skills).toEqual(['React']);
  expect(lastRequest).toMatchObject({ method: 'POST', url: '/resume/analyze', body: { text: 'resume text' } });
  expect(lastRequest.headers['x-internal-token']).toBe('test-internal-token');
});

it('propagates actionable provider-unavailable messages as 503', async () => {
  behaviour = () => ({ status: 503, body: { error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Ollama model \'llama3.1\' is not available. Run `ollama pull llama3.1`.' } } });
  await expect(client().generateQuestion({})).rejects.toMatchObject({ status: 503, code: 'AI_PROVIDER_UNAVAILABLE', message: expect.stringContaining('ollama pull') });
});

it('maps invalid model output to 502', async () => {
  behaviour = () => ({ status: 502, body: { error: { code: 'AI_OUTPUT_INVALID', message: 'The AI model returned output that did not match the expected format.' } } });
  await expect(client().evaluateAnswer({})).rejects.toMatchObject({ status: 502, code: 'AI_OUTPUT_INVALID' });
});

it('hides AI-service validation details and token problems from users', async () => {
  behaviour = () => ({ status: 422, body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues: [{ field: 'x' }] } } });
  await expect(client().generateReport({})).rejects.toMatchObject({ status: 502, code: 'AI_REQUEST_INVALID' });
  behaviour = () => ({ status: 401, body: { detail: 'Unauthorized' } });
  await expect(client().generateReport({})).rejects.toMatchObject({ status: 502, code: 'AI_SERVICE_AUTH', message: 'AI service configuration error.' });
  behaviour = () => ({ status: 500, body: { error: { message: 'Traceback: secret stuff' } } });
  const err = await client().generateReport({}).catch((e) => e);
  expect(err.status).toBe(502);
  expect(err.message).not.toContain('Traceback');
});

it('times out slow generations with 504', async () => {
  behaviour = () => ({ hang: true });
  await expect(client().evaluateAnswer({})).rejects.toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
});

it('reports an unreachable AI service as 503 and health as unreachable', async () => {
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:9';
  jest.resetModules();
  const c = require('../src/services/aiClient');
  await expect(c.analyzeJob({})).rejects.toMatchObject({ status: 503, code: 'AI_SERVICE_UNAVAILABLE' });
  expect(await c.health()).toEqual({ status: 'unreachable' });
});
