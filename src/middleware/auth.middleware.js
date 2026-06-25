// src/middleware/auth.middleware.js
// Protects routes by verifying JWT access tokens.
// Role guards: isTeacher, isStudent.

const { verifyAccessToken } = require('../services/token.service');
const { unauthorized, forbidden } = require('../utils/apiResponse');

/**
 * protect — verifies the Bearer token in Authorization header.
 * Attaches decoded payload to req.user.
 */
const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'يجب تسجيل الدخول أولاً');
    }

    const token   = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    req.user = decoded; // { userId, role, academicYear, groupId }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً');
    }
    return unauthorized(res, 'رمز المصادقة غير صالح');
  }
};

/**
 * isTeacher — must be used AFTER protect.
 * Blocks students from accessing teacher-only routes.
 */
const isTeacher = (req, res, next) => {
  if (req.user?.role !== 'teacher') {
    return forbidden(res, 'هذه الصفحة للمعلمين فقط');
  }
  next();
};

/**
 * isStudent — must be used AFTER protect.
 * Blocks teachers from accessing student-only routes.
 */
const isStudent = (req, res, next) => {
  if (req.user?.role !== 'student') {
    return forbidden(res, 'هذه الصفحة للطلاب فقط');
  }
  next();
};

/**
 * allowRoles — flexible multi-role guard.
 * Usage: allowRoles('teacher', 'student')
 */
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return forbidden(res, 'ليس لديك صلاحية للوصول لهذا المورد');
  }
  next();
};

module.exports = { protect, isTeacher, isStudent, allowRoles };