const models = require('../models');
const AppError = require('../utils/AppError');

async function updateProfile(user, updates) {
  if (updates.name !== undefined) user.name = updates.name;
  if (updates.bio !== undefined) user.bio = updates.bio;
  await user.save();
  return user;
}

/** Deletes the account and every document owned by it (right to erasure). */
async function deleteAccount(userId, password) {
  const user = await models.User.findById(userId).select('+password');
  if (!user) throw AppError.unauthorized();
  if (!(await user.verifyPassword(password))) throw new AppError(400, 'INVALID_PASSWORD', 'Password is incorrect');
  const filter = { user: user._id };
  await Promise.all([
    models.Resume.deleteMany(filter),
    models.JobDescription.deleteMany(filter),
    models.MatchAnalysis.deleteMany(filter),
    models.InterviewSession.deleteMany(filter),
    models.InterviewReport.deleteMany(filter),
    models.CodingSubmission.deleteMany(filter),
  ]);
  await user.deleteOne();
}

module.exports = { updateProfile, deleteAccount };
