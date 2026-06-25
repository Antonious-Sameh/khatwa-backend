// src/routes/student.schemas.js
// Joi validation schemas for student and group endpoints.

const Joi = require('joi');

const ACADEMIC_YEARS = [
  'first-prep',
  'second-prep',
  'third-prep',
  'first-sec',
  'second-sec',
];

const OBJECT_ID = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
  'string.pattern.base': 'المعرف غير صحيح',
});

// ── Student schemas ───────────────────────────────────────────────────────────

const createStudentSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min':   'الاسم يجب أن يكون حرفين على الأقل',
    'any.required': 'اسم الطالب مطلوب',
  }),
  academicYear: Joi.string().valid(...ACADEMIC_YEARS).required().messages({
    'any.only':    'السنة الدراسية غير صحيحة',
    'any.required': 'السنة الدراسية مطلوبة',
  }),
  group: OBJECT_ID.optional().allow(null, ''),
  phone: Joi.string().pattern(/^01[0-9]{9}$/).optional().allow(null, '').messages({
    'string.pattern.base': 'رقم الهاتف يجب أن يكون 11 رقماً ويبدأ بـ 01',
  }),
  parentPhone: Joi.string().pattern(/^01[0-9]{9}$/).optional().allow(null, '').messages({
    'string.pattern.base': 'رقم هاتف ولي الأمر يجب أن يكون 11 رقماً ويبدأ بـ 01',
  }),
});

const updateStudentSchema = Joi.object({
  name:         Joi.string().min(2).max(100),
  academicYear: Joi.string().valid(...ACADEMIC_YEARS),
  group:        OBJECT_ID.allow(null, ''),
  phone:        Joi.string().pattern(/^01[0-9]{9}$/).allow(null, ''),
  parentPhone:  Joi.string().pattern(/^01[0-9]{9}$/).allow(null, ''),
  isActive:     Joi.boolean(),
}).min(1).messages({
  'object.min': 'يجب إرسال حقل واحد على الأقل للتعديل',
});

// ── Group schemas ─────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  'السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة',
];

const sessionSchema = Joi.object({
  day:  Joi.string().valid(...DAYS_OF_WEEK).required().messages({
    'any.only':    'اليوم غير صحيح',
    'any.required': 'اليوم مطلوب',
  }),
  time: Joi.string().max(20).required().messages({
    'any.required': 'الوقت مطلوب',
  }),
});

const createGroupSchema = Joi.object({
  name: Joi.string().min(2).max(80).required().messages({
    'string.min':   'اسم المجموعة يجب أن يكون حرفين على الأقل',
    'any.required': 'اسم المجموعة مطلوب',
  }),
  academicYear: Joi.string().valid(...ACADEMIC_YEARS).required().messages({
    'any.only':    'السنة الدراسية غير صحيحة',
    'any.required': 'السنة الدراسية مطلوبة',
  }),
  schedule:   Joi.array().items(sessionSchema).max(2).optional().default([]),
  monthlyFee: Joi.number().min(0).optional(),
});

const updateGroupSchema = Joi.object({
  name:        Joi.string().min(2).max(80),
  academicYear: Joi.string().valid(...ACADEMIC_YEARS),
  schedule:    Joi.array().items(sessionSchema).max(2),
  monthlyFee:  Joi.number().min(0),
  isActive:    Joi.boolean(),
}).min(1).messages({
  'object.min': 'يجب إرسال حقل واحد على الأقل للتعديل',
});

module.exports = {
  createStudentSchema,
  updateStudentSchema,
  createGroupSchema,
  updateGroupSchema,
};