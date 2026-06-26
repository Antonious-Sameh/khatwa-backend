// src/routes/payment.routes.js
// Teacher writes, student reads own payments only (enforced in student.routes).

const express = require('express');
const router  = express.Router();

const {
  updatePeriod, 
  createPayment,
  getGroupPayments,
  getStudentPayments,
  updatePayment,
  addInstallment,
  updateInstallment,
  deleteInstallment,
  getYearSummary,
} = require('../controllers/payment.controller');

const { isTeacher } = require('../middleware/auth.middleware');
const { validate }  = require('../middleware/validate.middleware');
const {
  createPaymentSchema,
  addInstallmentSchema,
  updateInstallmentSchema,
  updatePaymentSchema,
} = require('./payment.schemas');

// ── Summary ───────────────────────────────────────────────────────────────────
// GET /api/payments/summary?year=
router.get('/summary', isTeacher, getYearSummary);

// ── Group / year view ─────────────────────────────────────────────────────────
// GET /api/payments?year=&group=&month=
router.get('/', isTeacher, getGroupPayments);

// ── Single student ────────────────────────────────────────────────────────────
// GET /api/payments/student/:studentId
router.get('/student/:studentId', getStudentPayments);

// ── Payment record CRUD ───────────────────────────────────────────────────────
// POST /api/payments
router.post('/', isTeacher, validate(createPaymentSchema), createPayment);

// ── ميزة تعديل اسم الفترة الجديدة ──
// PATCH /api/payments/:paymentId/period
router.patch('/:paymentId/period', isTeacher, updatePeriod);

// PATCH /api/payments/:paymentId
router.patch('/:paymentId', isTeacher, validate(updatePaymentSchema), updatePayment);

// ── Installments ──────────────────────────────────────────────────────────────
// POST /api/payments/:paymentId/installments
router.post(
  '/:paymentId/installments',
  isTeacher,
  validate(addInstallmentSchema),
  addInstallment
);

// PATCH /api/payments/:paymentId/installments/:instId
router.patch(
  '/:paymentId/installments/:instId',
  isTeacher,
  validate(updateInstallmentSchema),
  updateInstallment
);

// DELETE /api/payments/:paymentId/installments/:instId
router.delete(
  '/:paymentId/installments/:instId',
  isTeacher,
  deleteInstallment
);

module.exports = router;