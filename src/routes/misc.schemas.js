// src/routes/misc.schemas.js
// Joi schemas for Points, Notes, Lessons, Heroes.

const Joi = require('joi');

const ACADEMIC_YEARS = [
  'first-prep', 'second-prep', 'third-prep', 'first-sec', 'second-sec',
];

const OBJECT_ID = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ 'string.pattern.base': 'المعرف غير صحيح' });

// ── Points ────────────────────────────────────────────────────────────────────
const addPointSchema = Joi.object({
  studentId: OBJECT_ID.required().messages({ 'any.required': 'معرف الطالب مطلوب' }),
  type:      Joi.string().valid('add', 'remove').required().messages({
    'any.only':    'النوع يجب أن يكون add أو remove',
    'any.required': 'نوع المعاملة مطلوب',
  }),
  amount: Joi.number().integer().min(1).required().messages({
    'number.min':   'عدد النقاط يجب أن يكون واحد على الأقل',
    'any.required': 'عدد النقاط مطلوب',
  }),
  reason: Joi.string().min(1).max(200).optional().allow('', null).messages({
    'any.required': 'سبب النقاط مطلوب',
  }),
});

// ── Notes ─────────────────────────────────────────────────────────────────────
const createNoteSchema = Joi.object({
  type: Joi.string().valid('general', 'private').required().messages({
    'any.only':    'النوع يجب أن يكون general أو private',
    'any.required': 'نوع الملاحظة مطلوب',
  }),
  text: Joi.string().min(2).max(1000).required().messages({
    'any.required': 'نص الملاحظة مطلوب',
  }),
  // Required for general
  academicYear: Joi.when('type', {
    is:   'general',
    then: Joi.string().valid(...ACADEMIC_YEARS).required().messages({
      'any.required': 'السنة الدراسية مطلوبة للملاحظات العامة',
    }),
    otherwise: Joi.string().valid(...ACADEMIC_YEARS).optional().allow(null),
  }),
  // Required for private
  studentId: Joi.when('type', {
    is:   'private',
    then: OBJECT_ID.required().messages({ 'any.required': 'الطالب مطلوب للملاحظات الخاصة' }),
    otherwise: OBJECT_ID.optional().allow(null, ''),
  }),
});

// ── Lessons ───────────────────────────────────────────────────────────────────
const createLessonSchema = Joi.object({
  title:        Joi.string().min(2).max(200).required().messages({ 'any.required': 'عنوان الدرس مطلوب' }),
  academicYear: Joi.string().valid(...ACADEMIC_YEARS).required().messages({ 'any.required': 'السنة الدراسية مطلوبة' }),
  type:         Joi.string().valid('video', 'file').required().messages({ 'any.required': 'نوع الدرس مطلوب' }),
  order:        Joi.number().integer().min(1).optional(),
  published:    Joi.boolean().optional(),
  // Video fields
  videoUrl:     Joi.string().uri().optional().allow(null, ''),
  duration:     Joi.string().max(10).optional().allow(null, ''),
  thumbnailUrl: Joi.string().uri().optional().allow(null, ''),
  // File fields
  fileUrl:      Joi.string().uri().optional().allow(null, ''),
  fileType:     Joi.string().max(20).optional().allow(null, ''),
  fileSize:     Joi.string().max(20).optional().allow(null, ''),
  // Sequential locking
  requirePreviousLesson: Joi.boolean().optional(),
  previousLesson:        OBJECT_ID.optional().allow(null, ''),
});

const updateLessonSchema = Joi.object({
  title:                 Joi.string().min(2).max(200),
  order:                 Joi.number().integer().min(1),
  published:             Joi.boolean(),
  videoUrl:              Joi.string().uri().allow(null, ''),
  duration:              Joi.string().max(10).allow(null, ''),
  thumbnailUrl:          Joi.string().uri().allow(null, ''),
  fileUrl:               Joi.string().uri().allow(null, ''),
  fileType:              Joi.string().max(20).allow(null, ''),
  fileSize:              Joi.string().max(20).allow(null, ''),
  requirePreviousLesson: Joi.boolean(),
  previousLesson:        OBJECT_ID.allow(null, ''),
}).min(1).messages({ 'object.min': 'يجب إرسال حقل واحد على الأقل' });

const reorderLessonsSchema = Joi.object({
  // Array of { lessonId, order } pairs
  lessons: Joi.array().items(
    Joi.object({
      lessonId: OBJECT_ID.required(),
      order:    Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
});

const watchSchema = Joi.object({
  watchDuration: Joi.number().min(0).optional().default(0),
  completed:     Joi.boolean().optional().default(false),
});

// ── Heroes ────────────────────────────────────────────────────────────────────
const createHeroSchema = Joi.object({
  name:           Joi.string().min(2).max(100).required().messages({ 'any.required': 'اسم البطل مطلوب' }),
  achievement:    Joi.string().min(2).max(500).required().messages({ 'any.required': 'الإنجاز مطلوب' }),
  graduationYear: Joi.string().max(4).optional().allow(null, ''),
  order:          Joi.number().integer().min(0).optional(),
});

const updateHeroSchema = Joi.object({
  name:           Joi.string().min(2).max(100),
  achievement:    Joi.string().min(2).max(500),
  graduationYear: Joi.string().max(4).allow(null, ''),
  order:          Joi.number().integer().min(0),
}).min(1);

module.exports = {
  addPointSchema,
  createNoteSchema,
  createLessonSchema,
  updateLessonSchema,
  reorderLessonsSchema,
  watchSchema,
  createHeroSchema,
  updateHeroSchema,
};