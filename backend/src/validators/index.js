/** Request schemas (zod). Strings are trimmed and bounded; objects reject unknown keys. */
const { z } = require('zod');
const { CATEGORIES, DIFFICULTIES } = require('../models/InterviewSession');

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters') // bcrypt only uses the first 72 bytes
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain a letter and a number');

const auth = {
  register: z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
      email,
      password,
    })
    .strict(),
  // Login deliberately avoids detailed rules: any mismatch returns the same generic error.
  login: z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) }).strict(),
  changePassword: z
    .object({ currentPassword: z.string().min(1).max(200), newPassword: password })
    .strict()
    .refine((v) => v.currentPassword !== v.newPassword, {
      message: 'New password must be different from the current password',
      path: ['newPassword'],
    }),
};

const users = {
  update: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      bio: z.string().trim().max(500).optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, 'Nothing to update'),
  remove: z.object({ password: z.string().min(1).max(200) }).strict(),
};

const idParam = z.object({ id: objectId });

const jobs = {
  create: z
    .object({
      title: z.string().trim().max(200).optional().default(''),
      company: z.string().trim().max(200).optional().default(''),
      rawText: z
        .string()
        .trim()
        .min(80, 'Paste the full job description (at least 80 characters)')
        .max(30000, 'Job description is too long (max 30,000 characters)'),
    })
    .strict(),
  match: z.object({ resumeId: objectId }).strict(),
};

const interviews = {
  create: z
    .object({
      resumeId: objectId.optional().nullable(),
      jobId: objectId.optional().nullable(),
      role: z.string().trim().min(2).max(120),
      difficulty: z.enum(DIFFICULTIES),
      category: z.enum(CATEGORIES),
      totalQuestions: z.coerce.number().int().min(1).max(10).default(5),
    })
    .strict(),
  answer: z
    .object({
      answer: z.string().trim().min(1, 'Please write an answer (or say what you would do)').max(8000, 'Answer is too long (max 8,000 characters)'),
    })
    .strict(),
  list: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    status: z.enum(['in_progress', 'completed', 'abandoned']).optional(),
  }).strict(),
};

const coding = {
  slugParam: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/, 'Invalid problem') }),
  submit: z
    .object({
      language: z.literal('cpp').default('cpp'),
      code: z.string().min(1, 'Code is empty').max(20000, 'Code is too long (max 20,000 characters)'),
      mode: z.enum(['run', 'submit']).default('submit'),
    })
    .strict(),
};

const knowledge = {
  search: z
    .object({
      query: z.string().trim().min(2).max(500),
      topic: z.string().trim().max(60).optional(),
      topK: z.coerce.number().int().min(1).max(10).default(4),
    })
    .strict(),
  create: z
    .object({
      docId: z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/),
      title: z.string().trim().min(1).max(200),
      topic: z.string().trim().regex(/^[a-z0-9-]{1,60}$/),
      source: z.string().trim().max(300).optional().default(''),
      content: z.string().min(50).max(300000),
    })
    .strict(),
  docParam: z.object({ docId: z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/) }),
};

module.exports = { objectId, idParam, auth, users, jobs, interviews, coding, knowledge };
