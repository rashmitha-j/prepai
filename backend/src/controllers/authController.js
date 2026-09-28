const authService = require('../services/authService');

exports.register = async (req, res) => {
  const { user, token } = await authService.register(req.body);
  res.status(201).json({ user, token });
};

exports.login = async (req, res) => {
  const { user, token } = await authService.login(req.body);
  res.json({ user, token });
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};

exports.changePassword = async (req, res) => {
  const { user, token } = await authService.changePassword(req.user._id, req.body);
  res.json({ user, token, message: 'Password updated' });
};
