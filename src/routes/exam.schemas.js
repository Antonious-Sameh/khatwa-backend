// src/routes/exam.schemas.js

const Joi = require('joi');

const ACADEMIC_YEARS = [
  'first-prep', 'second-prep', 'third-prep', 'first-sec', 'second-sec',
];

const OBJECT_ID = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ 'string.pattern.base': 'المعرف غير صحيح' });

// ── Exam schemas ──────────────────────────────────────────────────────────────

const createExamSchema = Joi.object({
  title: Joi.string().min(2).max(150).required().messages({
    'string.min':   'العنوان يجب أن يكون حرفين على الأقل',
    'any.required': 'عنوان الامتحان مطلوب',
  }),
  academicYear: Joi.string().valid(...ACADEMIC_YEARS).required().messages({
    'any.only':    'السنة الدراسية غير صحيحة',
    'any.required': 'السنة الدراسية مطلوبة',
  }),
  maxScore: Joi.number().min(1).required().messages({
    'number.min':   'الدرجة الكاملة يجب أن تكون أكبر من صفر',
    'any.required': 'الدرجة الكاملة مطلوبة',
  }),
  status:      Joi.string().valid('draft', 'published', 'closed').optional(),
  examDate:    Joi.date().iso().optional().allow(null),
  description: Joi.string().max(500).optional().allow(null, ''),
});

const updateExamSchema = Joi.object({
  title:        Joi.string().min(2).max(150),
  academicYear: Joi.string().valid(...ACADEMIC_YEARS),
  maxScore:     Joi.number().min(1),
  status:       Joi.string().valid('draft', 'published', 'closed'),
  examDate:     Joi.date().iso().allow(null),
  description:  Joi.string().max(500).allow(null, ''),
}).min(1).messages({ 'object.min': 'يجب إرسال حقل واحد على الأقل' });

const changeStatusSchema = Joi.object({
  status: Joi.string().valid('draft', 'published', 'closed').required().messages({
    'any.only':    'الحالة يجب أن تكون draft أو published أو closed',
    'any.required': 'الحالة مطلوبة',
  }),
});

// ── Grade schemas ─────────────────────────────────────────────────────────────

const enterGradeSchema = Joi.object({
  studentId: OBJECT_ID.required().messages({ 'any.required': 'معرف الطالب مطلوب' }),
  examId:    OBJECT_ID.required().messages({ 'any.required': 'معرف الامتحان مطلوب' }),
  score:     Joi.number().min(0).required().messages({
    'number.min':   'الدرجة لا يمكن أن تكون سالبة',
    'any.required': 'الدرجة مطلوبة',
  }),
  note: Joi.string().max(200).optional().allow(null, ''),
});

const updateGradeSchema = Joi.object({
  score: Joi.number().min(0).required().messages({
    'number.min':   'الدرجة لا يمكن أن تكون سالبة',
    'any.required': 'الدرجة مطلوبة',
  }),
  note: Joi.string().max(200).optional().allow(null, ''),
});

// Bulk grade entry: [{ studentId, score, note? }]
const bulkGradesSchema = Joi.object({
  examId: OBJECT_ID.required().messages({ 'any.required': 'معرف الامتحان مطلوب' }),
  grades: Joi.array().items(
    Joi.object({
      studentId: OBJECT_ID.required(),
      score:     Joi.number().min(0).required(),
      note:      Joi.string().max(200).optional().allow(null, ''),
    })
  ).min(1).required().messages({
    'array.min':    'يجب إرسال درجة طالب واحد على الأقل',
    'any.required': 'الدرجات مطلوبة',
  }),
});

module.exports = {
  createExamSchema,
  updateExamSchema,
  changeStatusSchema,
  enterGradeSchema,
  updateGradeSchema,
  bulkGradesSchema,
};