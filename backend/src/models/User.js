const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email'],
    },
    // bcrypt hash; excluded from queries unless explicitly selected
    password: { type: String, required: true, select: false },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    passwordChangedAt: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.passwordChangedAt;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.statics.normalizeEmail = (email) => String(email || '').trim().toLowerCase();

userSchema.methods.setPassword = async function setPassword(plain, rounds) {
  this.password = await bcrypt.hash(plain, rounds);
  this.passwordChangedAt = new Date();
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(String(plain), this.password);
};

/** Tokens issued before the last password change are rejected. */
userSchema.methods.tokenIssuedBeforePasswordChange = function tokenIssuedBefore(iatSeconds) {
  if (!this.passwordChangedAt) return false;
  return iatSeconds * 1000 < this.passwordChangedAt.getTime() - 1000;
};

module.exports = mongoose.model('User', userSchema);
