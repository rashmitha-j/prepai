const db = require('./helpers/db');
const { app, request } = require('./helpers/api');
const { loadConfig } = require('../src/config/env');
const { sanitizeFilename, hasPdfSignature, cleanExtractedText } = require('../src/utils/files');
const { findUnsafeKey } = require('../src/middleware/sanitize');
const { normalizeOutput } = require('../src/services/codeRunner');

describe('health and security headers', () => {
  beforeAll(db.connect);
  afterAll(db.disconnect);

  it('reports degraded status when the AI service is unreachable', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'connected', aiService: 'unreachable' });
  });

  it('sets helmet headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('allows configured CORS origins only', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('configuration validation', () => {
  const base = { NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48), AI_SERVICE_TOKEN: 'tok', MONGO_URI: 'mongodb://x/y' };

  it('accepts a strong production configuration', () => {
    expect(loadConfig(base).isProduction).toBe(true);
  });

  it('rejects weak or placeholder JWT secrets in production', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, JWT_SECRET: 'replace_me'.repeat(5) })).toThrow(/JWT_SECRET/);
  });

  it('requires the AI service token in production and a JWT secret everywhere', () => {
    expect(() => loadConfig({ ...base, AI_SERVICE_TOKEN: '' })).toThrow(/AI_SERVICE_TOKEN/);
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow(/JWT_SECRET/);
  });

  it('parses comma-separated client URLs', () => {
    const cfg = loadConfig({ ...base, CLIENT_URL: 'https://a.vercel.app/, https://b.example' });
    expect(cfg.clientUrls).toEqual(['https://a.vercel.app', 'https://b.example']);
  });
});

describe('utilities', () => {
  it('sanitises filenames', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\evil.pdf')).toMatch(/^[\w.\- ()]+$/);
    expect(sanitizeFilename('My CV (final).pdf')).toBe('My CV (final).pdf');
    expect(sanitizeFilename('')).toBe('resume.pdf');
    expect(sanitizeFilename(`${'a'.repeat(300)}.pdf`).length).toBeLessThanOrEqual(100);
  });

  it('checks PDF signatures', () => {
    expect(hasPdfSignature(Buffer.from('%PDF-1.7\n...'))).toBe(true);
    expect(hasPdfSignature(Buffer.from('MZ\x90\x00 not a pdf'))).toBe(false);
    expect(hasPdfSignature(Buffer.from(''))).toBe(false);
  });

  it('cleans extracted text', () => {
    expect(cleanExtractedText('a\u0000b   c\n\n\n\nd -- 1 of 2 --')).toBe('ab c\n\nd');
  });

  it('finds unsafe keys at any depth', () => {
    expect(findUnsafeKey({ a: { b: [{ $gt: 1 }] } })).toBe('$gt');
    expect(findUnsafeKey({ 'a.b': 1 })).toBe('a.b');
    expect(findUnsafeKey({ a: 'fine', b: ['$not-a-key'] })).toBeNull();
  });

  it('normalises judge output whitespace', () => {
    expect(normalizeOutput('1  2\r\n3 \n\n')).toBe('1 2 3');
  });
});
