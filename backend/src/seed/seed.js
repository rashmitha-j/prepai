#!/usr/bin/env node
/**
 * Development seed: knowledge base documents, coding problems and an optional demo user.
 *
 *   npm run seed                      # upsert knowledge docs + coding problems (non-destructive)
 *   npm run seed -- --demo-user       # also create demo@prepai.dev with a random password
 *   npm run seed -- --reset --yes     # DESTRUCTIVE: wipe knowledge docs and problems first
 *
 * Refuses to run when NODE_ENV=production. Contains no real credentials: the demo user's
 * password is generated at runtime (or read from DEMO_USER_PASSWORD) and printed once.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const config = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { CodingProblem, CodingSubmission, KnowledgeDocument, User } = require('../models');
const knowledgeService = require('../services/knowledgeService');

const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
const PROBLEMS_FILE = path.join(__dirname, 'problems.json');

function parseMarkdown(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  if (match) {
    for (const line of match[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  const content = match ? raw.slice(match[0].length) : raw;
  const slug = path.basename(file, '.md');
  return { docId: meta.id || `kb-${slug}`, title: meta.title || slug, topic: meta.topic || slug, source: meta.source || `${slug}.md`, content };
}

async function confirm(question) {
  if (process.argv.includes('--yes')) return true;
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} Type "yes" to continue: `);
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

async function seedKnowledge() {
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md')).sort();
  const docs = files.map((f) => parseMarkdown(path.join(KNOWLEDGE_DIR, f)));
  for (const d of docs) await knowledgeService.upsertDocument(d);
  console.log(`✓ ${docs.length} knowledge documents stored in MongoDB`);
  try {
    const result = await knowledgeService.ingestDocuments(docs);
    console.log(`✓ Indexed into the vector store: ${result.chunks} chunks`);
  } catch (err) {
    console.warn(`! Could not index into the AI service (${err.message}).`);
    console.warn('  Documents are saved; the backend re-indexes them automatically when the AI service is available.');
  }
}

async function seedProblems() {
  const problems = JSON.parse(fs.readFileSync(PROBLEMS_FILE, 'utf8'));
  for (const p of problems) {
    await CodingProblem.findOneAndUpdate({ slug: p.slug }, { $set: p }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  }
  console.log(`✓ ${problems.length} coding problems upserted`);
}

async function seedDemoUser() {
  const email = 'demo@prepai.dev';
  const password = process.env.DEMO_USER_PASSWORD || `Demo-${crypto.randomBytes(6).toString('base64url')}1`;
  let user = await User.findOne({ email });
  if (!user) user = new User({ name: 'Demo User', email, bio: 'Demo account for local development.' });
  await user.setPassword(password, config.bcryptRounds);
  await user.save();
  console.log(`✓ Demo user ready: ${email}`);
  if (!process.env.DEMO_USER_PASSWORD) console.log(`  Generated password (shown once): ${password}`);
}

async function main() {
  if (config.isProduction) {
    console.error('✗ Refusing to seed: NODE_ENV=production. Seeding is for local development only.');
    process.exit(1);
  }
  const host = config.mongoUri.replace(/\/\/[^@]*@/, '//***@');
  console.log(`Seeding ${host} (${config.env})`);
  await connectDatabase(config.mongoUri);

  if (process.argv.includes('--reset')) {
    console.warn('\n⚠  --reset will DELETE all knowledge documents, coding problems and coding submissions in this database.');
    if (!(await confirm('Continue?'))) {
      console.log('Aborted. Nothing was deleted.');
      await disconnectDatabase();
      return;
    }
    await Promise.all([KnowledgeDocument.deleteMany({}), CodingProblem.deleteMany({}), CodingSubmission.deleteMany({})]);
    console.log('✓ Existing seed collections cleared');
  }

  await seedKnowledge();
  await seedProblems();
  if (process.argv.includes('--demo-user')) await seedDemoUser();
  await disconnectDatabase();
  console.log('Done.');
}

main().catch(async (err) => {
  console.error(`Seed failed: ${err.message}`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
