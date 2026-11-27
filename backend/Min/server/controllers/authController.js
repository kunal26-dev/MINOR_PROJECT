const User = require('../models/User');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const generateToken = require('../utils/generateToken');
const { sendSuccess } = require('../utils/apiResponse');
const { isValidEmail, isString } = require('../utils/validators');
const { isEmailConfigured, sendPasswordResetEmail } = require('../utils/email');
const { hashResetToken, createResetCredentials } = require('../utils/passwordReset');

const PUBLIC_ROLES = ['Student', 'Teacher'];

// POST /api/auth/register  (public: Student or Teacher only)
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, semester } = req.body;
  const errors = [];

  if (!isString(name) || name.trim().length < 2) errors.push('Name is required (min 2 characters)');
  if (!isValidEmail(email)) errors.push('A valid email is required');
  if (!isString(password) || password.length < 8) errors.push('Password is required (min 8 characters)');
  if (errors.length) throw new AppError('Validation failed', 400, errors);

  // Public registration can never create an Admin
  let assignedRole = 'Student';
  if (role !== undefined && role !== null && role !== '') {
    if (!isString(role)) throw new AppError('Invalid role', 400);
    const normalized = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    if (normalized === 'Admin') throw new AppError('Admin accounts cannot be created through registration', 403);
    if (!PUBLIC_ROLES.includes(normalized)) throw new AppError('Role must be Student or Teacher', 400);
    assignedRole = normalized;
  }

  let assignedSemester;
  if (assignedRole === 'Student') {
    assignedSemester = typeof semester === 'string' && semester.trim() ? Number(semester) : semester;
    if (!Number.isInteger(assignedSemester) || assignedSemester < 1 || assignedSemester > 8) {
      throw new AppError('Students must choose a semester from 1 to 8', 400);
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) {
    throw new AppError('An account with this email already exists', 409);
  }

  const user = await User.create({
    name,
    email: normalizedEmail,
    password,
    role: assignedRole,
    ...(assignedSemester ? { semester: assignedSemester } : {}),
  });

  sendSuccess(res, 201, 'Registration successful', { user, token: generateToken(user) });
});

// POST /api/auth/login  (all roles, including Admin)
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!isValidEmail(email) || !isString(password) || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
  // Same message for unknown email and wrong password
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (user.accountStatus !== 'Active') {
    throw new AppError('Your account has been deactivated. Please contact the administrator.', 403);
  }

  sendSuccess(res, 200, 'Login successful', { user, token: generateToken(user) });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Current user retrieved', { user: req.user });
});

// PUT /api/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!isString(currentPassword) || !currentPassword) throw new AppError('Current password is required', 400);
  if (!isString(newPassword) || newPassword.length < 8) {
    throw new AppError('New password is required (min 8 characters)', 400);
  }
  if (currentPassword === newPassword) throw new AppError('New password must be different from the current one', 400);

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError('Current password is incorrect', 401);
  }

  user.password = newPassword; // hashed by the pre-save hook
  await user.save();

  sendSuccess(res, 200, 'Password changed successfully', { token: generateToken(user) });
});

const passwordResetMessage = 'If an active account uses that email, a reset link will be sent. Check spam, or contact the administrator if it does not arrive.';

const requestPasswordReset = asyncHandler(async (req, res) => {
  const email = isString(req.body.email) ? req.body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) throw new AppError('A valid email is required', 400);
  if (!isEmailConfigured()) {
    throw new AppError('Password recovery is not configured yet. Please contact the administrator.', 503);
  }

  const user = await User.findOne({ email, accountStatus: 'Active' })
    .select('+passwordResetSentAt');
  const now = new Date();
  if (user && (!user.passwordResetSentAt || now - user.passwordResetSentAt >= 60_000)) {
    const credentials = createResetCredentials(now);
    user.passwordResetTokenHash = credentials.tokenHash;
    user.passwordResetExpires = credentials.expiresAt;
    user.passwordResetSentAt = now;
    await user.save();

    const baseUrl = (process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
    try {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetUrl: `${baseUrl}/?resetToken=${encodeURIComponent(credentials.token)}`,
      });
    } catch (error) {
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpires = undefined;
      user.passwordResetSentAt = undefined;
      await user.save();
      console.error(`Password reset email delivery failed: ${error.message}`);
    }
  }

  sendSuccess(res, 200, passwordResetMessage);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!isString(token) || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new AppError('A valid password reset token is required', 400);
  }
  if (!isString(newPassword) || newPassword.length < 8) {
    throw new AppError('New password is required (min 8 characters)', 400);
  }
  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(token),
    passwordResetExpires: { $gt: new Date() },
    accountStatus: 'Active',
  }).select('+passwordResetTokenHash +passwordResetExpires +passwordResetSentAt');
  if (!user) throw new AppError('This password reset link is invalid or has expired. Request a new one.', 400);

  user.password = newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.passwordResetSentAt = undefined;
  await user.save();
  sendSuccess(res, 200, 'Password reset successfully. Please sign in with your new password.');
});

module.exports = {
  register,
  login,
  getMe,
  changePassword,
  requestPasswordReset,
  resetPassword,
};
