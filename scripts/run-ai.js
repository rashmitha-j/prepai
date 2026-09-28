#!/usr/bin/env node
/**
 * Cross-platform launcher for the Python AI service.
 *
 *   node scripts/run-ai.js dev    -> uvicorn with auto-reload
 *   node scripts/run-ai.js start  -> uvicorn without reload
 *   node scripts/run-ai.js test   -> pytest
 *   node scripts/run-ai.js lint   -> ruff
 *
 * Uses ai-service/.venv if it exists (created by `npm run setup:ai`),
 * otherwise falls back to the python found on PATH.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const aiDir = path.join(__dirname, '..', 'ai-service');
const isWin = process.platform === 'win32';
const venvPython = isWin
  ? path.join(aiDir, '.venv', 'Scripts', 'python.exe')
  : path.join(aiDir, '.venv', 'bin', 'python');

const python = fs.existsSync(venvPython) ? venvPython : isWin ? 'python' : 'python3';
const port = process.env.AI_PORT || '8000';

const commands = {
  dev: ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', port],
  start: ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', port],
  test: ['-m', 'pytest', '-q'],
  lint: ['-m', 'ruff', 'check', 'app', 'tests'],
};

const mode = process.argv[2] || 'dev';
if (!commands[mode]) {
  console.error(`Unknown mode "${mode}". Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

if (python !== venvPython) {
  console.warn('[ai-service] .venv not found — using system Python. Run `npm run setup:ai` first if imports fail.');
}

const child = spawn(python, [...commands[mode], ...process.argv.slice(3)], {
  cwd: aiDir,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
