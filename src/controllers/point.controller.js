// src/controllers/point.controller.js

const mongoose = require('mongoose');
const Point    = require('../models/Point');
const User     = require('../models/User');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// Helper: calculate balance for a student
const calcBalance = async (studentId) => {
  const result = await Point.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id:    null,
        balance: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'add'] },
              '$amount',
              { $multiply: ['$amount', -1] },
            ],
          },
        },
        total: { $sum: 1 },
        added:  { $sum: { $cond: [{ $eq: ['$type', 'add'] },    '$amount', 0] } },
        removed:{ $sum: { $cond: [{ $eq: ['$type', 'remove'] }, '$amount', 0] } },
      },
    },
  ]);
  return result[0] || { balance: 0, total: 0, added: 0, removed: 0 };
};

// ── POST /api/points ──────────────────────────────────────────────────────────
const addPoint = asyncHandler(async (req, res) => {
  const { studentId, type, amount, reason } = req.body;

  const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  // Guard: don't let balance go negative
  if (type === 'remove') {
    const current = await calcBalance(studentId);
    if (amount > current.balance) {
      return error(
        res,
        `لا يمكن خصم ${amount} نقطة — الرصيد الحالي: ${current.balance} نقطة`,
        400
      );
    }
  }

  const point = await Point.create({
    student:   studentId,
    type,
    amount,
    reason,
    createdBy: req.user.userId,
  });

  const balance = await calcBalance(studentId);

  return created(res, { point, balance }, `تم ${type === 'add' ? 'إضافة' : 'خصم'} ${amount} نقطة بنجاح`);
});

// ── GET /api/points?year=&student= ───────────────────────────────────────────
const getPoints = asyncHandler(async (req, res) => {
  const { year, student: studentId, page = 1, limit = 30 } = req.query;

  // Build student filter
  const studentFilter = { role: 'student', isActive: true };
  if (year)      studentFilter.academicYear = year;
  if (studentId) studentFilter._id          = studentId;

  const students = await User.find(studentFilter).select('_id').lean();
  const ids       = students.map((s) => s._id);

  // Aggregate balance per student
  const balances = await Point.aggregate([
    { $match: { student: { $in: ids } } },
    {
      $group: {
        _id:     '$student',
        balance: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'add'] },
              '$amount',
              { $multiply: ['$amount', -1] },
            ],
          },
        },
        total:   { $sum: 1 },
      },
    },
    { $sort: { balance: -1 } },
  ]);

  // Join with student names
  await User.populate(balances, {
    path:   '_id',
    select: 'name codePlain academicYear group',
    model:  'User',
  });

  return success(res, { leaderboard: balances, total: balances.length });
});

// ── GET /api/points/student/:studentId ───────────────────────────────────────
const getStudentPoints = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Point.countDocuments({ student: studentId });

  const transactions = await Point
    .find({ student: studentId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const balance = await calcBalance(studentId);

  return success(res, {
    student: { _id: student._id, name: student.name, code: student.codePlain },
    balance,
    transactions,
    pagination: {
      total,
      page:  Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// ── DELETE /api/points/:id ────────────────────────────────────────────────────
// Allow teacher to remove a mistakenly entered transaction.
const deletePoint = asyncHandler(async (req, res) => {
  const point = await Point.findById(req.params.id);
  if (!point) return notFound(res, 'المعاملة غير موجودة');

  await point.deleteOne();
  return success(res, {}, 'تم حذف المعاملة بنجاح');
});

module.exports = { addPoint, getPoints, getStudentPoints, deletePoint };