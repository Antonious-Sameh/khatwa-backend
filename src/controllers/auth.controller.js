// src/controllers/auth.controller.js

const User = require('../models/User');
const {
  generateTokenPair,
  setRefreshCookie,
  clearRefreshCookie,
  verifyRefreshToken,
} = require('../services/token.service');
const { success, unauthorized } = require('../utils/apiResponse');
const { asyncHandler }          = require('../middleware/error.middleware');

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length < 4) {
    return unauthorized(res, 'الكود مطلوب ويجب أن يكون 4 أحرف على الأقل');
  }

  const enteredCode = code.trim().toUpperCase();

  // Fast lookup by codePlain (indexed) — no need to scan all users
  const user = await User
    .findOne({ codePlain: enteredCode, isActive: true })
    .select('+codeHash +refreshToken');

  if (!user) {
    return unauthorized(res, 'الكود غير صحيح أو الحساب غير نشط');
  }

  // Verify against bcrypt hash
  const isMatch = await user.compareCode(enteredCode);
  if (!isMatch) {
    return unauthorized(res, 'الكود غير صحيح');
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokenPair(user);

  // Store hashed refresh token
  await user.setRefreshToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  return success(res, {
    accessToken,
    user: user.toSafeObject(),
  }, 'تم تسجيل الدخول بنجاح');
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    return unauthorized(res, 'لا توجد جلسة نشطة');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    return unauthorized(res, 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
  }

  const user = await User.findById(decoded.userId).select('+refreshToken');
  if (!user || !user.isActive) {
    return unauthorized(res, 'المستخدم غير موجود أو غير نشط');
  }

  const isValid = await user.compareRefreshToken(token);
  if (!isValid) {
    clearRefreshCookie(res);
    return unauthorized(res, 'تم اكتشاف استخدام مشبوه للجلسة');
  }

  // Token rotation
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user);
  await user.setRefreshToken(newRefreshToken);
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, newRefreshToken);

  return success(res, { accessToken }, 'تم تجديد الجلسة');
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    try {
      const decoded = verifyRefreshToken(token);
      await User.findByIdAndUpdate(decoded.userId, { refreshToken: null });
    } catch {
      // Token invalid — clear cookie anyway
    }
  }

  clearRefreshCookie(res);
  return success(res, {}, 'تم تسجيل الخروج بنجاح');
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const me = asyncHandler(async (req, res) => {
  const user = await User
    .findById(req.user.userId)
    .populate('group', 'name academicYear')
    .lean();

  if (!user) return unauthorized(res, 'المستخدم غير موجود');

  delete user.codeHash;
  delete user.refreshToken;
  delete user.__v;

  return success(res, { user });
});

module.exports = { login, refresh, logout, me };
