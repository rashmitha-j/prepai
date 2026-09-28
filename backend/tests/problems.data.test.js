/**
 * Data integrity: every seeded problem must be solvable by its reference solution through
 * the real judge, and starter code must compile. Catches broken test data before users do.
 */
const fs = require('node:fs');
const path = require('node:path');
const { judgeCpp, detectCapabilities } = require('../src/services/codeRunner');

const problems = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/seed/problems.json'), 'utf8'));
const describeIf = detectCapabilities().gpp ? describe : describe.skip;

describeIf('seeded coding problems', () => {
  it('have unique slugs, visible examples and hidden tests', () => {
    expect(new Set(problems.map((p) => p.slug)).size).toBe(problems.length);
    for (const p of problems) {
      expect(p.examples.length).toBeGreaterThan(0);
      expect(p.testCases.some((t) => t.isHidden)).toBe(true);
      expect(['easy', 'medium', 'hard']).toContain(p.difficulty);
    }
  });

  it.each(problems.map((p) => [p.slug, p]))('%s: reference solution is accepted and starter code compiles', async (slug, p) => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/solutions', `${slug}.cpp`), 'utf8');
    const accepted = await judgeCpp({ code, tests: p.testCases, timeLimitMs: p.timeLimitMs, memoryLimitMb: p.memoryLimitMb });
    expect(accepted.verdict).toBe('accepted');
    const starter = await judgeCpp({ code: p.starterCode.cpp, tests: p.testCases.slice(0, 1), timeLimitMs: p.timeLimitMs, memoryLimitMb: p.memoryLimitMb });
    expect(starter.verdict).not.toBe('compile_error');
  });
});
