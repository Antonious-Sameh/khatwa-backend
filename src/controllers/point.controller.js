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

  // These three queries are independent of each other — run them in
  // parallel instead of awaiting one after another to cut response time.
  const [total, transactions, balance] = await Promise.all([
    Point.countDocuments({ student: studentId }),
    Point
      .find({ student: studentId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    calcBalance(studentId),
  ]);

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

// ══════════════════════════════════════════════════════════════════════════════
// EXAM-LINKED POINTS — the "النقاط" column in the grades sheet.
// Reuses the same Point ledger above; each exam's value for a student is
// just ONE 'add' transaction tagged with that exam (sourceExam for
// electronic exams, sourceExamType+sourceExamTitle for paper exams), kept
// separate from every other exam's transaction and from manual points
// added elsewhere. Editing re-uses (upserts) that same transaction instead
// of stacking new ones, so typing a new value never double-counts the old
// one — and the overall balance returned by calcBalance/getPoints already
// includes it automatically, since it is a normal 'add' row.
// ══════════════════════════════════════════════════════════════════════════════

// Build the filter that identifies "this exam's point transactions" — the
// student key is added by callers (setExamPoint scopes to one student,
// getExamPoints leaves it out to fetch all students at once). Shared so
// both endpoints always agree on the same documents.
function examSourceFilter({ examId, examType, examTitle }) {
  if (examId) {
    return { sourceExam: examId };
  }
  if (examType === 'paper' && examTitle) {
    return { sourceExam: null, sourceExamType: 'paper', sourceExamTitle: examTitle };
  }
  return null; // not enough info to identify an exam
}

// ── GET /api/points/by-exam?examId= | ?examType=paper&examTitle= ─────────────
// Returns { studentId: amount } for every student who currently has points
// recorded for THIS specific exam — used to pre-fill the "النقاط" column
// when the teacher opens (or re-opens) an exam's grade sheet.
const getExamPoints = asyncHandler(async (req, res) => {
  const { examId, examType, examTitle } = req.query;

  const sourceFilter = examSourceFilter({ examId, examType, examTitle });
  if (!sourceFilter) return error(res, 'بيانات الامتحان غير كافية', 400);

  const rows = await Point.find({ type: 'add', ...sourceFilter }).select('student amount').lean();
  const points = {};
  rows.forEach(p => { points[p.student.toString()] = p.amount; });

  return success(res, { points });
});

// ── PUT /api/points/by-exam ────────────────────────────────────────────────────
// body: { studentId, amount, examId? , examType?, examTitle? }
// Upserts (or deletes, if amount is empty/0/negative) the ONE points
// transaction linked to (student, exam). Never touches any other exam's
// transaction or the student's manually-added points.
const setExamPoint = asyncHandler(async (req, res) => {
  const { studentId, amount, examId, examType, examTitle } = req.body;

  const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const sourceFilter = examSourceFilter({ examId, examType, examTitle });
  if (!sourceFilter) return error(res, 'بيانات الامتحان غير كافية', 400);
  const filter = { student: studentId, type: 'add', ...sourceFilter };

  const numeric = amount === '' || amount === null || amount === undefined ? null : Number(amount);

  // Empty / zero / invalid input → this exam contributes no points for this
  // student. Remove any previously-saved transaction for it (if none
  // exists, deleteOne is a harmless no-op) rather than storing a zero,
  // since amount has a `min: 1` validator on the Point model.
  if (numeric === null || isNaN(numeric) || numeric <= 0) {
    await Point.deleteOne(filter);
    const balance = await calcBalance(studentId);
    return success(res, { amount: 0, balance }, 'تم مسح نقاط هذا الامتحان');
  }

  const point = await Point.findOneAndUpdate(
    filter,
    {
      $set: {
        amount: Math.round(numeric),
        reason: examTitle ? `نقاط امتحان: ${examTitle}` : 'نقاط امتحان',
        sourceExamType: examId ? 'electronic' : 'paper',
        createdBy: req.user.userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const balance = await calcBalance(studentId);
  return success(res, { point, balance }, 'تم حفظ النقاط');
});

module.exports = {
  addPoint, getPoints, getStudentPoints, deletePoint,
  getExamPoints, setExamPoint,
};