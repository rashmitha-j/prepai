const jwt = require('jsonwebtoken');
const db = require('./helpers/db');
const { app, request, registerUser } = require('./helpers/api');
const User = require('../src/models/User');

beforeAll(db.connect);
afterAll(db.disconnect);

describe('POST /api/auth/register', () => {
  it('creates a user, normalises email, hashes password and never returns it', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '  Asha Rao ', email: '  Asha.Rao@Example.COM ', password: 'Password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe('asha.rao@example.com');
    expect(res.body.user.name).toBe('Asha Rao');
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);

    const stored = await User.findOne({ email: 'asha.rao@example.com' }).select('+password');
    expect(stored.password).toMatch(/^\$2[aby]\$/);
    expect(stored.password).not.toContain('Password123');
    expect(jwt.decode(res.body.token).sub).toBe(String(stored._id));
  });

  it('rejects duplicate emails case-insensitively', async () => {
    await registerUser({ email: 'dup@example.com' });
    const res = await request(app).post('/api/auth/register').send({ name: 'Dup', email: 'DUP@example.com', password: 'Password123' });
    expect(res.status).toBe(409);
  });

  it.each([
    [{ name: 'A', email: 'a@example.com', password: 'Password123' }, 'name'],
    [{ name: 'Valid', email: 'not-an-email', password: 'Password123' }, 'email'],
    [{ name: 'Valid', email: 'b@example.com', password: 'short1' }, 'password'],
    [{ name: 'Valid', email: 'c@example.com', password: 'lettersonly' }, 'password'],
  ])('validates input %#', async (body, field) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d) => d.field.includes(field))).toBe(true);
  });

  it('does not allow setting a role at registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@example.com', password: 'Password123', role: 'admin' });
    expect(res.status).toBe(422);
    expect(await User.exists({ email: 'eve@example.com' })).toBeNull();
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const { user, password } = await registerUser();
    const res = await request(app).post('/api/auth/login').send({ email: user.email.toUpperCase(), password });
    expect(res.status).toBe(200);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('returns the same generic 401 for wrong password and unknown email', async () => {
    const { user } = await registerUser();
    const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'WrongPass123' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'WrongPass123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.message).toBe('Invalid email or password');
  });
});

describe('NoSQL injection and malformed requests', () => {
  it('rejects operator objects in login', async () => {
    await registerUser();
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects operator keys nested anywhere in the body', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'X Y', email: 'x@example.com', password: 'Password123', meta: { $where: 'sleep(1000)' } });
    expect(res.status).toBe(400);
  });

  it('rejects dotted and prototype-pollution keys', async () => {
    const dotted = await request(app).post('/api/auth/login').send({ 'email.address': 'x', password: 'y' });
    expect(dotted.status).toBe(400);
    const proto = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":"a@b.co","password":"x","__proto__":{"admin":true}}');
    expect(proto.status).toBe(400);
  });

  it('rejects operators in query strings', async () => {
    const { auth } = await registerUser();
    const res = await request(app).get('/api/interviews?status[$ne]=completed').set(auth);
    expect([400, 422]).toContain(res.status);
  });

  it('handles malformed JSON with a safe 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": "a@b.co",');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  it('rejects oversized bodies', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Authentication middleware', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const { auth, user } = await registerUser();
    const res = await request(app).get('/api/auth/me').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.password).toBeUndefined();
  });

  it('rejects tampered, unsigned and wrongly signed tokens', async () => {
    const { token, user } = await registerUser();
    const [h, p, s] = token.split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify({ sub: '000000000000000000000000' })).toString('base64url')}.${s}`;
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    const wrongKey = jwt.sign({ sub: user._id }, 'another-secret');
    for (const t of [tampered, none, wrongKey, 'garbage']) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(401);
    }
  });

  it('rejects tokens of deleted users (user is reloaded from the DB)', async () => {
    const { auth, user } = await registerUser();
    await User.deleteOne({ _id: user._id });
    const res = await request(app).get('/api/auth/me').set(auth);
    expect(res.status).toBe(401);
  });

  it('rejects expired tokens', async () => {
    const { user } = await registerUser();
    const expired = jwt.sign({ sub: user._id, exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('requires the current password', async () => {
    const { auth } = await registerUser();
    const res = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: 'WrongPass123', newPassword: 'NewPassword456' });
    expect(res.status).toBe(400);
  });

  it('changes the password, issues a new token and invalidates older tokens', async () => {
    const { auth, user, password } = await registerUser();
    const oldToken = jwt.sign({ sub: user._id, iat: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    const res = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: password, newPassword: 'NewPassword456' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));

    const stale = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(stale.status).toBe(401);
    const fresh = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(fresh.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'NewPassword456' });
    expect(login.status).toBe(200);
  });
});

describe('/api/users/me', () => {
  it('updates profile fields but not email or role', async () => {
    const { auth } = await registerUser();
    const ok = await request(app).patch('/api/users/me').set(auth).send({ name: 'New Name', bio: 'Preparing for SWE roles' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.bio).toBe('Preparing for SWE roles');
    const bad = await request(app).patch('/api/users/me').set(auth).send({ role: 'admin' });
    expect(bad.status).toBe(422);
  });

  it('deletes the account after password confirmation', async () => {
    const { auth, password, user } = await registerUser();
    expect((await request(app).delete('/api/users/me').set(auth).send({ password: 'WrongPass123' })).status).toBe(400);
    expect((await request(app).delete('/api/users/me').set(auth).send({ password })).status).toBe(204);
    expect(await User.exists({ _id: user._id })).toBeNull();
  });
});
