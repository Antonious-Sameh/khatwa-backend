// src/routes/payment.schemas.js

const Joi = require('joi');

const OBJECT_ID = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ 'string.pattern.base': 'المعرف غير صحيح' });

// ── Create a payment record for a student/month ───────────────────────────────
const createPaymentSchema = Joi.object({
  studentId:      OBJECT_ID.required().messages({ 'any.required': 'معرف الطالب مطلوب' }),
  month:          Joi.string().min(3).max(30).required().messages({ 'any.required': 'الشهر مطلوب' }),
  requiredAmount: Joi.number().min(0).required().messages({ 'any.required': 'المبلغ المطلوب مطلوب' }),
  groupId:        OBJECT_ID.optional().allow(null, ''),
});

// ── Add an installment to an existing payment ─────────────────────────────────
const addInstallmentSchema = Joi.object({
  amount: Joi.number().min(1).required().messages({
    'number.min':   'مبلغ الدفعة يجب أن يكون أكبر من صفر',
    'any.required': 'مبلغ الدفعة مطلوب',
  }),
  paidAt: Joi.date().iso().optional().default(() => new Date()),
  note:   Joi.string().max(200).optional().allow(null, ''),
});

// ── Edit an existing installment ──────────────────────────────────────────────
const updateInstallmentSchema = Joi.object({
  amount: Joi.number().min(1),
  paidAt: Joi.date().iso(),
  note:   Joi.string().max(200).allow(null, ''),
}).min(1).messages({ 'object.min': 'يجب إرسال حقل واحد على الأقل للتعديل' });

// ── Update required amount for a month ───────────────────────────────────────
const updatePaymentSchema = Joi.object({
  requiredAmount: Joi.number().min(0),
  month:          Joi.string().min(3).max(30),
}).min(1);

module.exports = {
  createPaymentSchema,
  addInstallmentSchema,
  updateInstallmentSchema,
  updatePaymentSchema,
};