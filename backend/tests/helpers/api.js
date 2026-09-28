const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();
let counter = 0;

async function registerUser(overrides = {}) {
  counter += 1;
  const body = {
    name: 'Test User',
    email: `user${counter}_${Date.now()}@example.com`,
    password: 'Password123',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, password: body.password, auth: { Authorization: `Bearer ${res.body.token}` } };
}

module.exports = { app, request, registerUser };
