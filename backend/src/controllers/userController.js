const userService = require('../services/userService');

exports.getMe = async (req, res) => res.json({ user: req.user });

exports.updateMe = async (req, res) => {
  const user = await userService.updateProfile(req.user, req.body);
  res.json({ user, message: 'Profile updated' });
};

exports.deleteMe = async (req, res) => {
  await userService.deleteAccount(req.user._id, req.body.password);
  res.status(204).end();
};
