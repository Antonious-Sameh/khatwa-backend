// src/middleware/error.middleware.js
// Global error handler — catches all unhandled errors thrown in controllers.
// Must be registered LAST in app.js (after all routes).

const { NODE_ENV } = require('../config/env');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'حدث خطأ غير متوقع في الخادم';

  // ── Mongoose: duplicate key ──────────────────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue?.[field];
    message = `هذا ${field === 'codePlain' ? 'الكود' : 'الحقل'} مستخدم بالفعل${value !== undefined && value !== null ? ': ' + value : ''}`;
  }

  // ── Mongoose: validation error ───────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 422;
    const errors = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
    return res.status(statusCode).json({
      success: false,
      message: 'بيانات غير صحيحة',
      errors,
    });
  }

  // ── Mongoose: bad ObjectId ────────────────────────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 404;
    message = 'المعرف المُدخَل غير صحيح';
  }

  // ── JWT errors ────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'رمز المصادقة غير صالح';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'انتهت صلاحية الجلسة';
  }

  // ── Multer errors ─────────────────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'حجم الملف كبير جداً';
  }

  // Log the error in development
  if (NODE_ENV === 'development') {
    console.error(`\n❌ ERROR [${statusCode}]: ${message}`);
    console.error(err.stack);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Catches async errors — wrap controllers with this or use express-async-errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { errorHandler, asyncHandler };