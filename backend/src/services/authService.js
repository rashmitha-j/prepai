const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const INVALID_CREDENTIALS = 'Invalid email or password';
// Compared against when the email does not exist so response time does not reveal it.
let dummyHash;

function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn, algorithm: 'HS256' });
}

async function register({ name, email, password }) {
  const normalized = User.normalizeEmail(email);
  if (await User.exists({ email: normalized })) {
    throw AppError.conflict('An account with this email already exists');
  }
  const user = new User({ name, email: normalized });
  await user.setPassword(password, config.bcryptRounds);
  await user.save();
  return { user, token: signToken(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email: User.normalizeEmail(email) }).select('+password');
  if (!user) {
    const bcrypt = require('bcrypt');
    dummyHash = dummyHash || (await bcrypt.hash('timing-equaliser', config.bcryptRounds));
    await bcrypt.compare(String(password), dummyHash);
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }
  if (!(await user.verifyPassword(password))) throw AppError.unauthorized(INVALID_CREDENTIALS);
  user.password = undefined;
  return { user, token: signToken(user) };
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw AppError.unauthorized();
  if (!(await user.verifyPassword(currentPassword))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
  }
  await user.setPassword(newPassword, config.bcryptRounds);
  await user.save();
  user.password = undefined;
  // A fresh token is issued; older tokens are rejected by the auth middleware.
  return { user, token: signToken(user) };
}

module.exports = { register, login, changePassword, signToken, INVALID_CREDENTIALS };
