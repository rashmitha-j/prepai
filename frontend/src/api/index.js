import client from './client';

const data = (promise) => promise.then((res) => res.data);

export const authApi = {
  register: (body) => data(client.post('/auth/register', body)),
  login: (body) => data(client.post('/auth/login', body)),
  me: () => data(client.get('/auth/me')),
  changePassword: (body) => data(client.post('/auth/change-password', body)),
};

export const usersApi = {
  update: (body) => data(client.patch('/users/me', body)),
  remove: (password) => data(client.delete('/users/me', { data: { password } })),
};

export const resumesApi = {
  list: () => data(client.get('/resumes')),
  get: (id) => data(client.get(`/resumes/${id}`)),
  upload: (file, onUploadProgress) => {
    const form = new FormData();
    form.append('resume', file);
    return data(client.post('/resumes', form, { onUploadProgress }));
  },
  reanalyze: (id) => data(client.post(`/resumes/${id}/reanalyze`)),
  remove: (id) => data(client.delete(`/resumes/${id}`)),
};

export const jobsApi = {
  list: () => data(client.get('/jobs')),
  get: (id) => data(client.get(`/jobs/${id}`)),
  create: (body) => data(client.post('/jobs', body)),
  reanalyze: (id) => data(client.post(`/jobs/${id}/reanalyze`)),
  remove: (id) => data(client.delete(`/jobs/${id}`)),
  match: (id, resumeId) => data(client.post(`/jobs/${id}/match`, { resumeId })),
};

export const interviewsApi = {
  list: (params) => data(client.get('/interviews', { params })),
  get: (id) => data(client.get(`/interviews/${id}`)),
  start: (body) => data(client.post('/interviews', body)),
  answer: (id, answer) => data(client.post(`/interviews/${id}/answer`, { answer })),
  next: (id) => data(client.post(`/interviews/${id}/next`)),
  complete: (id) => data(client.post(`/interviews/${id}/complete`)),
  abandon: (id) => data(client.post(`/interviews/${id}/abandon`)),
  report: (id) => data(client.get(`/interviews/${id}/report`)),
  remove: (id) => data(client.delete(`/interviews/${id}`)),
};

export const codingApi = {
  problems: () => data(client.get('/coding/problems')),
  problem: (slug) => data(client.get(`/coding/problems/${slug}`)),
  submit: (slug, code, mode) => data(client.post(`/coding/problems/${slug}/submit`, { code, mode, language: 'cpp' })),
  submissions: (slug) => data(client.get(`/coding/problems/${slug}/submissions`)),
  submission: (id) => data(client.get(`/coding/submissions/${id}`)),
  explain: (id) => data(client.post(`/coding/submissions/${id}/explain`)),
};

export const knowledgeApi = {
  list: () => data(client.get('/knowledge')),
  status: () => data(client.get('/knowledge/status')),
  search: (body) => data(client.post('/knowledge/search', body)),
};

export const dashboardApi = {
  get: () => data(client.get('/dashboard')),
};

export const systemApi = {
  health: () => data(client.get('/health')),
};
