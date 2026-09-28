/**
 * Environment configuration. Values come only from environment variables
 * (a local .env file is loaded in development). Nothing secret is hard-coded.
 */
const path = require('node:path');
const { z } = require('zod');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const bool = (def) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/prepai'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AI_SERVICE_TOKEN: z.string().optional().default(''),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  TRUST_PROXY: bool(false),
  KNOWLEDGE_AUTO_SYNC: bool(true),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(20).default(5),
  // Code execution: process (local sandbox) | docker | disabled
  CODE_RUNNER: z.enum(['process', 'docker', 'disabled']).default('process'),
  CODE_RUNNER_DOCKER_IMAGE: z.string().default('gcc:13'),
  ALLOW_UNSAFE_CODE_EXECUTION: bool(false),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
});

function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const cfg = parsed.data;
  const isProduction = cfg.NODE_ENV === 'production';

  if (isProduction) {
    const weak = cfg.JWT_SECRET.length < 32 || /replace_me|changeme|secret/i.test(cfg.JWT_SECRET);
    if (weak) throw new Error('JWT_SECRET must be a random string of at least 32 characters in production.');
    if (!cfg.AI_SERVICE_TOKEN) throw new Error('AI_SERVICE_TOKEN is required in production.');
  }

  return {
    env: cfg.NODE_ENV,
    isProduction,
    isTest: cfg.NODE_ENV === 'test',
    port: cfg.PORT,
    mongoUri: cfg.MONGO_URI,
    jwt: { secret: cfg.JWT_SECRET, expiresIn: cfg.JWT_EXPIRES_IN },
    clientUrls: cfg.CLIENT_URL.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
    ai: { url: cfg.AI_SERVICE_URL.replace(/\/$/, ''), token: cfg.AI_SERVICE_TOKEN, timeoutMs: cfg.AI_REQUEST_TIMEOUT_MS },
    trustProxy: cfg.TRUST_PROXY,
    knowledgeAutoSync: cfg.KNOWLEDGE_AUTO_SYNC,
    upload: { maxBytes: Math.round(cfg.MAX_UPLOAD_MB * 1024 * 1024) },
    codeRunner: {
      mode: cfg.CODE_RUNNER,
      dockerImage: cfg.CODE_RUNNER_DOCKER_IMAGE,
      allowUnsafe: cfg.ALLOW_UNSAFE_CODE_EXECUTION,
    },
    bcryptRounds: cfg.BCRYPT_ROUNDS,
  };
}

const config = loadConfig();

module.exports = config;
module.exports.loadConfig = loadConfig;
