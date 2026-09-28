export const CATEGORY_LABELS = {
  mixed: 'Mixed (tailored to the job)',
  dsa: 'Data Structures & Algorithms',
  dbms: 'DBMS',
  sql: 'SQL',
  os: 'Operating Systems',
  cn: 'Computer Networks',
  oop: 'OOP',
  javascript: 'JavaScript',
  react: 'React',
  node: 'Node.js',
  'system-design': 'System Design',
  resume: 'Resume & projects',
  behavioral: 'Behavioral',
};

export const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export const LEVEL_LABELS = {
  intern: 'Internship',
  entry: 'Entry level',
  mid: 'Mid level',
  senior: 'Senior',
  lead: 'Lead / Staff',
  unspecified: 'Not specified',
};

export const VERDICT_LABELS = {
  accepted: 'Accepted',
  wrong_answer: 'Wrong answer',
  compile_error: 'Compilation error',
  runtime_error: 'Runtime error',
  time_limit_exceeded: 'Time limit exceeded',
  output_limit_exceeded: 'Output limit exceeded',
  internal_error: 'Judge error',
};

export const SCORE_LABELS = {
  correctness: 'Correctness',
  relevance: 'Relevance',
  technicalDepth: 'Technical depth',
  clarity: 'Clarity',
  completeness: 'Completeness',
  communication: 'Communication',
};

export function scoreTone(score) {
  if (score === null || score === undefined) return 'neutral';
  if (score >= 7.5) return 'good';
  if (score >= 5) return 'mid';
  return 'bad';
}

export function scoreColor(score) {
  return { good: 'var(--good)', mid: 'var(--mid)', bad: 'var(--bad)', neutral: 'var(--faint)' }[scoreTone(score)];
}

export function formatScore(score) {
  return score === null || score === undefined ? '—' : Number(score).toFixed(1);
}

export function formatDate(value, withTime = false) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

export function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : pluralWord || `${word}s`}`;
}
