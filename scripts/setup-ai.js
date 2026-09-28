#!/usr/bin/env node
/**
 * Creates a Python virtual environment for the AI service and installs its
 * dependencies. Works on macOS, Linux and Windows.
 *
 *   npm run setup:ai
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const aiDir = path.join(__dirname, '..', 'ai-service');
const venvDir = path.join(aiDir, '.venv');
const isWin = process.platform === 'win32';

function findSystemPython() {
  const candidates = isWin ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    const args = cmd === 'py' ? ['-3', '--version'] : ['--version'];
    const res = spawnSync(cmd, args, { encoding: 'utf8' });
    if (res.status === 0) {
      const version = (res.stdout || res.stderr).trim();
      const match = version.match(/Python (\d+)\.(\d+)/);
      if (match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 10))) {
        return { cmd, prefix: cmd === 'py' ? ['-3'] : [], version };
      }
    }
  }
  return null;
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: aiDir });
  if (res.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(res.status || 1);
  }
}

const python = findSystemPython();
if (!python) {
  console.error('Python 3.10+ is required for the AI service. Install it and re-run `npm run setup:ai`.');
  process.exit(1);
}
console.log(`Using ${python.version}`);

if (!fs.existsSync(venvDir)) {
  run(python.cmd, [...python.prefix, '-m', 'venv', '.venv']);
}

const venvPython = isWin
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python');

run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt', '-r', 'requirements-dev.txt']);
console.log('\nAI service environment ready.');
