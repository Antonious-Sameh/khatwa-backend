// src/routes/attendance.schemas.js

const Joi = require('joi');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const OBJECT_ID = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ 'string.pattern.base': 'المعرف غير صحيح' });

// ── Submit full group attendance in one request ───────────────────────────────
// Body: { groupId, date, records: [{ studentId, status, note? }] }
const bulkAttendanceSchema = Joi.object({
  groupId: OBJECT_ID.required().messages({ 'any.required': 'معرف المجموعة مطلوب' }),

  date: Joi.string()
    .pattern(DATE_PATTERN)
    .required()
    .messages({
      'string.pattern.base': 'صيغة التاريخ يجب أن تكون YYYY-MM-DD',
      'any.required':        'التاريخ مطلوب',
    }),

  records: Joi.array()
    .items(
      Joi.object({
        studentId: OBJECT_ID.required().messages({ 'any.required': 'معرف الطالب مطلوب' }),
        status:    Joi.string().valid('present', 'absent').required().messages({
          'any.only':    'الحالة يجب أن تكون present أو absent',
          'any.required': 'حالة الحضور مطلوبة',
        }),
        note: Joi.string().max(200).optional().allow(null, ''),
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min':    'يجب إرسال سجل لطالب واحد على الأقل',
      'any.required': 'سجلات الحضور مطلوبة',
    }),
});

// ── Update single attendance record ──────────────────────────────────────────
const updateAttendanceSchema = Joi.object({
  status: Joi.string().valid('present', 'absent').required().messages({
    'any.only':    'الحالة يجب أن تكون present أو absent',
    'any.required': 'حالة الحضور مطلوبة',
  }),
  note: Joi.string().max(200).optional().allow(null, ''),
});

module.exports = { bulkAttendanceSchema, updateAttendanceSchema };