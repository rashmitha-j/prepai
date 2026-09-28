/** Deterministic AI service responses used by mocked aiClient calls. */
const resumeAnalysis = {
  summary: 'Full-stack JavaScript developer.',
  skills: ['JavaScript', 'React', 'Node.js', 'MongoDB'],
  technologies: ['Express.js', 'Docker', 'Git'],
  projects: [{ name: 'DevConnect', description: 'Developer social network', technologies: ['React', 'Node.js', 'MongoDB'] }],
  experience: [{ title: 'Web Development Intern', organization: 'Acme Corp', duration: '3 months', highlights: ['Built REST APIs'] }],
  education: [{ degree: 'B.Tech Computer Science', institution: 'State University', year: '2025' }],
  strengths: ['Hands-on MERN projects'],
  possibleGaps: ['No SQL experience listed'],
  detectedSkills: ['JavaScript', 'React', 'Node.js'],
  analysisMode: 'ai',
  warnings: [],
};

const jobAnalysis = {
  title: 'Junior Full Stack Developer',
  company: 'Nimbus',
  summary: 'Build React and Node.js features.',
  requiredSkills: ['React', 'Node.js', 'SQL', 'REST APIs'],
  preferredSkills: ['Docker', 'AWS'],
  responsibilities: ['Build features'],
  technologies: ['React', 'PostgreSQL'],
  experienceLevel: 'entry',
  detectedSkills: [],
  analysisMode: 'ai',
  warnings: [],
};

const matchAnalysis = {
  title: 'Interview Preparation Match Analysis',
  matchingSkills: ['React', 'Node.js', 'Docker'],
  missingSkills: ['SQL', 'REST APIs'],
  missingPreferredSkills: ['AWS'],
  coverage: { requiredMatched: 2, requiredTotal: 4, preferredMatched: 1, preferredTotal: 2, percent: 50, label: 'Approximate keyword coverage (heuristic)' },
  technologyAlignment: { matched: ['React'], missing: ['PostgreSQL'] },
  relevantProjects: [{ name: 'DevConnect', reason: 'MERN stack' }],
  experienceAlignment: 'Internship aligns with a junior role.',
  interviewTopics: ['SQL joins'],
  recommendations: ['Practice SQL'],
  analysisMode: 'ai',
  warnings: [],
  disclaimer: 'Not a hiring decision.',
};

let qCounter = 0;
function question(overrides = {}) {
  qCounter += 1;
  return {
    question: `Question ${qCounter}: explain how a deadlock can occur and how to prevent it?`,
    topic: 'Deadlocks',
    category: 'os',
    difficulty: 'medium',
    expectedPoints: ['Mutual exclusion', 'Circular wait'],
    rationale: 'OS fundamentals',
    isFollowUp: false,
    sources: [{ id: `kb-os::${qCounter}`, title: 'Operating Systems', topic: 'os', section: 'Deadlocks', source: 'os.md', score: 0.8 }],
    ...overrides,
  };
}

function evaluation({ score = 7, followUp = false } = {}) {
  return {
    scores: { correctness: score, relevance: score, technicalDepth: score, clarity: score, completeness: score, communication: score },
    overallScore: score,
    summary: 'Reasonable answer.',
    strengths: ['Clear'],
    missingPoints: ['Lock ordering'],
    suggestions: ['Add an example'],
    modelAnswer: 'A model answer.',
    followUp: { shouldAsk: followUp, question: followUp ? 'How does lock ordering help?' : '', reason: '' },
    sources: [],
  };
}

const report = {
  summary: 'Good fundamentals.',
  strengths: ['Clear definitions'],
  weakAreas: ['Deadlock prevention'],
  technicalGaps: ['Banker\'s algorithm'],
  communicationFeedback: 'Structured.',
  recommendedTopics: ['Operating Systems'],
  roadmap: [{ title: 'OS deep dive', focus: 'Deadlocks', actions: ['Read notes'], duration: '3 days' }],
  averageScore: 6.5,
  dimensionAverages: { correctness: 6.5 },
  topicScores: [{ topic: 'Deadlocks', averageScore: 5.5, questions: 2 }, { topic: 'Paging', averageScore: 8, questions: 1 }],
  sources: [],
  analysisMode: 'ai',
  warnings: [],
};

module.exports = { resumeAnalysis, jobAnalysis, matchAnalysis, question, evaluation, report };
