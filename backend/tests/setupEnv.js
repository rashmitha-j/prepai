// Deterministic test environment. No real secrets; the AI service URL points nowhere
// because every AI call is mocked (or served by an in-process fake AI server).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-not-used-anywhere-else';
process.env.JWT_EXPIRES_IN = '1h';
process.env.AI_SERVICE_URL = process.env.TEST_AI_SERVICE_URL || 'http://127.0.0.1:9';
process.env.AI_SERVICE_TOKEN = 'test-internal-token';
process.env.AI_REQUEST_TIMEOUT_MS = '3000';
process.env.BCRYPT_ROUNDS = '4';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.KNOWLEDGE_AUTO_SYNC = 'false';
process.env.CODE_RUNNER = 'process';
