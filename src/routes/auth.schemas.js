// src/routes/auth.schemas.js
// Joi validation schemas for auth endpoints.

const Joi = require('joi');

const loginSchema = Joi.object({
  code: Joi.string().min(4).max(50).required().messages({
    'string.min':  'الكود يجب أن يكون 4 أحرف على الأقل',
    'string.max':  'الكود طويل جداً',
    'any.required': 'الكود مطلوب',
  }),
  // Sent by the frontend to bind a student account to a single device.
  // Optional/ignored for teacher logins.
  deviceId: Joi.string().max(200).allow('', null).optional(),
});

module.exports = { loginSchema };