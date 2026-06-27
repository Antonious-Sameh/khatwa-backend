// src/controllers/account.controller.js
// Teacher account management: avatar upload + change code/password

const User      = require('../models/User');
const bcrypt    = require('bcryptjs');
const { cloudinary } = require('../config/multer');
const { success, notFound, error: apiError } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/account/me ───────────────────────────────────────────────────────
const getAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId)
    .populate('group', 'name')
    .lean();
  if (!user) return notFound(res, 'المستخدم غير موجود');
  delete user.codeHash; delete user.refreshToken; delete user.__v;
  return success(res, { user });
});

// ── POST /api/account/avatar ──────────────────────────────────────────────────
// multer uploadAvatar middleware runs before this
const uploadAvatarCtrl = asyncHandler(async (req, res) => {
  if (!req.file) return apiError(res, 'لم يتم رفع صورة', 400);

  const user = await User.findById(req.user.userId);
  if (!user) return notFound(res, 'المستخدم غير موجود');

  // Delete old avatar from Cloudinary if exists
  if (user.avatar) {
    try {
      const urlParts  = user.avatar.split('/');
      const publicId  = 'khatwa-plus/avatars/' + urlParts[urlParts.length - 1].split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    } catch { /* ignore deletion errors */ }
  }

  user.avatar = req.file.path;
  await user.save({ validateBeforeSave: false });

  return success(res, { avatarUrl: user.avatar }, 'تم رفع الصورة بنجاح');
});

// ── DELETE /api/account/avatar ────────────────────────────────────────────────
const removeAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return notFound(res, 'المستخدم غير موجود');

  if (user.avatar) {
    try {
      const urlParts = user.avatar.split('/');
      const publicId = 'khatwa-plus/avatars/' + urlParts[urlParts.length - 1].split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    } catch { /* ignore */ }
  }

  user.avatar = null;
  await user.save({ validateBeforeSave: false });
  return success(res, {}, 'تم حذف الصورة');
});

// ── PATCH /api/account/change-code ───────────────────────────────────────────
// Change login code (for teachers who use a code, not a password)
const changeCode = asyncHandler(async (req, res) => {
  const { currentCode, newCode } = req.body;

  if (!currentCode || !newCode) {
    return apiError(res, 'الكود الحالي والكود الجديد مطلوبان', 400);
  }
  if (newCode.trim().length < 4) {
    return apiError(res, 'الكود الجديد يجب أن يكون 4 أحرف على الأقل', 400);
  }

  const user = await User.findById(req.user.userId).select('+codeHash');
  if (!user) return notFound(res, 'المستخدم غير موجود');

  const isMatch = await user.compareCode(currentCode);
  if (!isMatch) return apiError(res, 'الكود الحالي غير صحيح', 400);

  const newUpper = newCode.trim().toUpperCase();

  // Check uniqueness
  const exists = await User.findOne({ codePlain: newUpper, _id: { $ne: user._id } });
  if (exists) return apiError(res, 'هذا الكود مستخدم بالفعل، جرب كوداً آخر', 400);

  user.codePlain = newUpper;
  await user.save();

  return success(res, { newCode: newUpper }, 'تم تغيير كود الدخول بنجاح');
});

// ── PATCH /api/account/update-info ───────────────────────────────────────────
const updateInfo = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const user = await User.findById(req.user.userId);
  if (!user) return notFound(res, 'المستخدم غير موجود');

  if (name  && name.trim().length >= 2)  user.name  = name.trim();
  if (phone !== undefined)               user.phone = phone?.trim() || null;

  await user.save();

  delete user._doc?.codeHash; delete user._doc?.refreshToken;
  return success(res, { user: user.toSafeObject() }, 'تم تحديث البيانات بنجاح');
});

// ── GET /api/account/teacher-info (public — for students to see teacher branding) ──
const getTeacherInfo = asyncHandler(async (req, res) => {
  const teacher = await User.findOne({ role: 'teacher', isActive: true })
    .select('name avatar').lean();
  return success(res, { teacher: teacher || null });
});

module.exports = { getAccount, uploadAvatar: uploadAvatarCtrl, removeAvatar, changeCode, updateInfo, getTeacherInfo };