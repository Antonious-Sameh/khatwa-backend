// src/controllers/payment.controller.js

const mongoose = require('mongoose');
const Payment  = require('../models/Payment');
const User     = require('../models/User');
const Group    = require('../models/Group');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/payments?year=&group=&month= ─────────────────────────────────────
// Returns payments for all students in a group (or year), with summary per student.
const getGroupPayments = asyncHandler(async (req, res) => {
  const { year, group: groupId, month } = req.query;

  if (!year && !groupId) {
    return error(res, 'يجب إرسال السنة الدراسية أو معرف المجموعة', 400);
  }

  // Build student filter
  const studentFilter = { role: 'student', isActive: true };
  if (year)    studentFilter.academicYear = year;
  if (groupId) studentFilter.group        = groupId;

  const students = await User
    .find(studentFilter)
    .select('_id name codePlain academicYear group')
    .populate('group', 'name')
    .sort({ name: 1 })
    .lean();

  if (!students.length) {
    return success(res, { students: [], summary: { total: 0, paid: 0, remaining: 0 } });
  }

  const studentIds = students.map((s) => s._id);

  // Payment filter
  const payFilter = { student: { $in: studentIds } };
  if (month) payFilter.month = month;

  const payments = await Payment
    .find(payFilter)
    .select('student month requiredAmount paidAmount installments')
    .lean();

  // Group payments by studentId for O(1) merge
  const payMap = {};
  payments.forEach((p) => {
    const sid = p.student.toString();
    if (!payMap[sid]) payMap[sid] = [];
    payMap[sid].push(p);
  });

  // Merge students with their payment data
  const result = students.map((s) => {
    const studentPayments = payMap[s._id.toString()] || [];
    const totalRequired   = studentPayments.reduce((sum, p) => sum + p.requiredAmount, 0);
    const totalPaid       = studentPayments.reduce((sum, p) => sum + p.paidAmount,     0);

    return {
      student:        s,
      totalRequired,
      totalPaid,
      totalRemaining: Math.max(0, totalRequired - totalPaid),
      isPaid:         totalRequired > 0 && totalPaid >= totalRequired,
      months:         studentPayments,
    };
  });

  // Group-level summary
  const summary = {
    totalStudents: result.length,
    totalRequired: result.reduce((s, r) => s + r.totalRequired, 0),
    totalPaid:     result.reduce((s, r) => s + r.totalPaid,     0),
    totalRemaining:result.reduce((s, r) => s + r.totalRemaining, 0),
    fullyPaid:     result.filter((r) => r.isPaid).length,
  };

  return success(res, { students: result, summary });
});

// ── GET /api/payments/student/:studentId ──────────────────────────────────────
// Full payment history for one student across all months.
const getStudentPayments = asyncHandler(async (req, res) => {
  const student = await User
    .findOne({ _id: req.params.studentId, role: 'student' })
    .select('name codePlain academicYear group')
    .populate('group', 'name')
    .lean();

  if (!student) return notFound(res, 'الطالب غير موجود');

  const payments = await Payment
    .find({ student: req.params.studentId })
    .sort({ createdAt: -1 })
    .lean();

  const totalRequired = payments.reduce((s, p) => s + p.requiredAmount, 0);
  const totalPaid     = payments.reduce((s, p) => s + p.paidAmount,     0);

  return success(res, {
    student,
    payments,
    summary: {
      totalRequired,
      totalPaid,
      totalRemaining: Math.max(0, totalRequired - totalPaid),
      months:         payments.length,
      status:         totalRequired > 0 && totalPaid >= totalRequired ? 'مكتمل' : 'غير مكتمل',
    },
  });
});

// ── POST /api/payments ────────────────────────────────────────────────────────
// Creates a payment record for a student/month.
// If one already exists for this student+month, returns it (idempotent).
const createPayment = asyncHandler(async (req, res) => {
  const { studentId, month, requiredAmount, groupId } = req.body;

  const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  // Check if payment already exists for this student+month
  const existing = await Payment.findOne({ student: studentId, month });
  if (existing) {
    return success(res, { payment: existing }, 'سجل المدفوعات لهذا الشهر موجود بالفعل');
  }

  const payment = await Payment.create({
    student:        studentId,
    group:          groupId || student.group || null,
    month,
    requiredAmount,
    paidAmount:     0,
    installments:   [],
  });

  return created(res, { payment }, 'تم إنشاء سجل المدفوعات بنجاح');
});

// ── PATCH /api/payments/:paymentId ───────────────────────────────────────────
// Update required amount or month label.
const updatePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.paymentId);
  if (!payment) return notFound(res, 'سجل المدفوعات غير موجود');

  const { requiredAmount, month } = req.body;
  if (requiredAmount !== undefined) payment.requiredAmount = requiredAmount;
  if (month          !== undefined) payment.month          = month;

  await payment.save();
  return success(res, { payment }, 'تم تعديل سجل المدفوعات بنجاح');
});

// ── POST /api/payments/:paymentId/installments ────────────────────────────────
// Adds a new installment (payment transaction) to a payment record.
const addInstallment = asyncHandler(async (req, res) => {
  const { amount, paidAt, note } = req.body;
  const teacherId = req.user.userId;

  const payment = await Payment.findById(req.params.paymentId);
  if (!payment) return notFound(res, 'سجل المدفوعات غير موجود');

  // Guard: don't allow paying more than remaining
  const remaining = payment.requiredAmount - payment.paidAmount;
  if (amount > remaining + 0.01) {
    return error(
      res,
      `المبلغ المدخل (${amount}) أكبر من المتبقي (${remaining.toFixed(2)})`,
      400
    );
  }

  payment.installments.push({
    amount,
    paidAt:     paidAt ? new Date(paidAt) : new Date(),
    note:       note || null,
    recordedBy: teacherId,
  });

  // pre-save hook recalculates paidAmount
  await payment.save();

  return created(res, { payment }, `تم إضافة دفعة بمبلغ ${amount} جنيه بنجاح`);
});

// ── PATCH /api/payments/:paymentId/installments/:instId ──────────────────────
// Edit an existing installment.
const updateInstallment = asyncHandler(async (req, res) => {
  const { amount, paidAt, note } = req.body;
  const { paymentId, instId }    = req.params;

  const payment = await Payment.findById(paymentId);
  if (!payment) return notFound(res, 'سجل المدفوعات غير موجود');

  const installment = payment.installments.id(instId);
  if (!installment) return notFound(res, 'الدفعة غير موجودة');

  if (amount !== undefined) installment.amount = amount;
  if (paidAt !== undefined) installment.paidAt = new Date(paidAt);
  if (note   !== undefined) installment.note   = note || null;

  await payment.save(); // recalculates paidAmount
  return success(res, { payment }, 'تم تعديل الدفعة بنجاح');
});

// ── DELETE /api/payments/:paymentId/installments/:instId ─────────────────────
// Remove an installment.
const deleteInstallment = asyncHandler(async (req, res) => {
  const { paymentId, instId } = req.params;

  const payment = await Payment.findById(paymentId);
  if (!payment) return notFound(res, 'سجل المدفوعات غير موجود');

  const before = payment.installments.length;
  payment.installments.pull({ _id: instId });

  if (payment.installments.length === before) {
    return notFound(res, 'الدفعة غير موجودة');
  }

  await payment.save(); // recalculates paidAmount
  return success(res, { payment }, 'تم حذف الدفعة بنجاح');
});

// ── GET /api/payments/summary?year= ──────────────────────────────────────────
// Overall financial summary for a year — used on teacher dashboard.
const getYearSummary = asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year) return error(res, 'السنة الدراسية مطلوبة', 400);

  // Get all students in this year
  const students = await User
    .find({ role: 'student', academicYear: year, isActive: true })
    .select('_id')
    .lean();

  const studentIds = students.map((s) => s._id);

  const summary = await Payment.aggregate([
    { $match: { student: { $in: studentIds } } },
    {
      $group: {
        _id:            null,
        totalRequired:  { $sum: '$requiredAmount' },
        totalPaid:      { $sum: '$paidAmount'     },
        studentCount:   { $addToSet: '$student'   },
      },
    },
    {
      $project: {
        totalRequired:  1,
        totalPaid:      1,
        totalRemaining: { $subtract: ['$totalRequired', '$totalPaid'] },
        studentCount:   { $size: '$studentCount' },
      },
    },
  ]);

  return success(res, {
    year,
    totalStudents: students.length,
    ...(summary[0] || { totalRequired: 0, totalPaid: 0, totalRemaining: 0 }),
  });
});



// ── PATCH /api/payments/:paymentId/period ─────────────────────────────────────
const updatePeriod = asyncHandler(async (req, res) => {
  const { month } = req.body;
  if (!month?.trim()) return error(res, 'اسم الفترة مطلوب', 400);

  const payment = await Payment.findById(req.params.paymentId);
  if (!payment) return notFound(res, 'سجل المدفوعات غير موجود');

  payment.month = month.trim();
  await payment.save();

  return success(res, { payment }, 'تم تعديل اسم الفترة بنجاح');
});





module.exports = {
  updatePeriod,
  createPayment,
  getGroupPayments,
  getStudentPayments,
  createPayment,
  updatePayment,
  addInstallment,
  updateInstallment,
  deleteInstallment,
  getYearSummary,
};