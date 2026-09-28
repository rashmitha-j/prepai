/**
 * HTTP client for the Python AI service. Business services call these methods and never
 * talk to an LLM directly. Failures are translated into safe, actionable AppErrors.
 */
const axios = require('axios');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const http = axios.create({
  baseURL: config.ai.url,
  timeout: config.ai.timeoutMs,
  headers: config.ai.token ? { 'X-Internal-Token': config.ai.token } : {},
  maxContentLength: 5 * 1024 * 1024,
});

function translateError(err, operation) {
  if (err.response) {
    const { status, data } = err.response;
    const aiMessage = data?.error?.message;
    const aiCode = data?.error?.code;
    if (status === 503) {
      // e.g. "Cannot reach Ollama at http://localhost:11434. Is `ollama serve` running?"
      return new AppError(503, aiCode || 'AI_PROVIDER_UNAVAILABLE', aiMessage || 'The AI provider is unavailable. Please try again later.');
    }
    if (status === 502) {
      return new AppError(502, aiCode || 'AI_PROVIDER_ERROR', aiMessage || 'The AI model returned an unusable response. Please try again.');
    }
    if (status === 401) {
      logger.error('AI service rejected the internal token — check AI_SERVICE_TOKEN on both services');
      return new AppError(502, 'AI_SERVICE_AUTH', 'AI service configuration error.');
    }
    if (status === 422) {
      logger.error(`AI service rejected ${operation} payload`, data?.error?.issues);
      return new AppError(502, 'AI_REQUEST_INVALID', 'Could not process this request with the AI service.');
    }
    return new AppError(502, 'AI_SERVICE_ERROR', 'The AI service failed to process the request.');
  }
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return new AppError(504, 'AI_TIMEOUT', 'The AI service took too long to respond. Please try again.');
  }
  return new AppError(
    503,
    'AI_SERVICE_UNAVAILABLE',
    'The AI service is not reachable. Make sure it is running (see README: "Running all services").',
  );
}

async function call(method, url, data, operation) {
  try {
    const res = await http.request({ method, url, data });
    return res.data;
  } catch (err) {
    throw translateError(err, operation || url);
  }
}

const aiClient = {
  health: async () => {
    try {
      const res = await http.get('/health', { timeout: 5000 });
      return res.data;
    } catch {
      return { status: 'unreachable' };
    }
  },
  analyzeResume: (text) => call('post', '/resume/analyze', { text }, 'resume analysis'),
  analyzeJob: (payload) => call('post', '/job/analyze', payload, 'job analysis'),
  analyzeMatch: (payload) => call('post', '/match/analyze', payload, 'match analysis'),
  generateQuestion: (payload) => call('post', '/interview/question', payload, 'question generation'),
  evaluateAnswer: (payload) => call('post', '/interview/evaluate', payload, 'answer evaluation'),
  generateFollowUp: (payload) => call('post', '/interview/follow-up', payload, 'follow-up generation'),
  generateReport: (payload) => call('post', '/interview/report', payload, 'report generation'),
  explainCode: (payload) => call('post', '/coding/explain', payload, 'code explanation'),
  ingest: (documents, replace = true) => call('post', '/rag/ingest', { documents, replace }, 'ingestion'),
  retrieve: (payload) => call('post', '/rag/retrieve', payload, 'retrieval'),
  ragStats: () => call('get', '/rag/stats', undefined, 'rag stats'),
  deleteDocument: (docId) => call('delete', `/rag/documents/${encodeURIComponent(docId)}`, undefined, 'rag delete'),
};

module.exports = aiClient;
module.exports.translateError = translateError;
