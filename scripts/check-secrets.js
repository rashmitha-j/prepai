#!/usr/bin/env node
/**
 * Lightweight secret scanner. Fails if a tracked-looking file contains
 * something that looks like a real credential, or if a real .env file
 * would not be ignored. It never prints the values it finds.
 *
 *   npm run check:secrets
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.venv', 'venv', 'dist', 'build', '.git', '__pycache__', '.pytest_cache', '.ruff_cache', 'data', 'coverage', 'tmp']);
const TEXT_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.py', '.json', '.yml', '.yaml', '.md', '.txt', '.html', '.css', '.toml', '.example', '.cfg', '.ini', '']);

const patterns = [
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'MongoDB URI with password', re: /mongodb(\+srv)?:\/\/[^\s:@/<>]+:[^\s@/<>]{6,}@/ },
];

const findings = [];
const envFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (/^\.env(\..+)?$/.test(entry.name) && entry.name !== '.env.example') {
      envFiles.push(path.relative(root, full));
      continue; // never read real env files
    }
    if (full === __filename) continue;
    const ext = path.extname(entry.name);
    if (!TEXT_EXT.has(ext) && !entry.name.endsWith('.example')) continue;
    const stat = fs.statSync(full);
    if (stat.size > 1024 * 1024) continue;
    const content = fs.readFileSync(full, 'utf8');
    for (const { name, re } of patterns) {
      if (re.test(content)) findings.push(`${path.relative(root, full)}: ${name}`);
    }
  }
}

walk(root);

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const ignoresEnv = /^\.env$/m.test(gitignore) && /^\.env\.\*$/m.test(gitignore);

console.log(`.gitignore ignores .env files: ${ignoresEnv ? 'yes' : 'NO'}`);
if (envFiles.length) {
  console.log(`Local env files present (ignored, contents not inspected): ${envFiles.join(', ')}`);
}
if (findings.length) {
  console.error('Possible secrets found:');
  findings.forEach((f) => console.error(`  - ${f}`));
}
if (!ignoresEnv || findings.length) process.exit(1);
console.log('No secrets detected in source files.');
