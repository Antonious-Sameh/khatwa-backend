// src/services/report.service.js
// Builds the comprehensive student report used in:
//   - GET /api/students/:id/report  (teacher view)
//   - GET /api/student/report       (student self-view)
//
// Each section is fetched in parallel for performance.
// As new models are added (Attendance, Grade, Payment, Point),
// uncomment the corresponding section.

const mongoose = require('mongoose');

const buildStudentReport = async (student) => {
  const studentId = student._id;

  // Run all DB queries in parallel
  const [
    attendanceStats,
    paymentSummary,
    grades,
    pointsBalance,
    rank,
    pointsRank,
  ] = await Promise.all([
    getAttendanceStats(studentId),
    getPaymentSummary(studentId),
    getGrades(studentId),
    getPointsBalance(studentId),
    getStudentRank(student),
    getStudentPointsRank(student),
  ]);

  return {
    student: {
      _id:              student._id,
      name:             student.name,
      code:             student.codePlain,
      academicYear:     student.academicYear,
      academicYearLabel: student.academicYearLabel,
      group:            student.group,
      phone:            student.phone,
      parentPhone:      student.parentPhone,
      avatar:           student.avatar,
      isActive:         student.isActive,
    },
    attendance:    attendanceStats,
    payments:      paymentSummary,
    grades,
    points:        pointsBalance,
    rank,
    pointsRank,
    generatedAt:   new Date().toISOString(),
  };
};

// ── Attendance ────────────────────────────────────────────────────────────────
const getAttendanceStats = async (studentId) => {
  try {
    const Attendance = mongoose.model('Attendance');
    const stats = await Attendance.aggregate([
      { $match: { student: new mongoose.Types.ObjectId(studentId) } },
      {
        $group: {
          _id:     null,
          total:   { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent:  { $sum: { $cond: [{ $eq: ['$status', 'absent']  }, 1, 0] } },
        },
      },
    ]);

    if (!stats.length) return { total: 0, present: 0, absent: 0, percentage: 0 };
    const { total, present, absent } = stats[0];
    return { total, present, absent, percentage: Math.round((present / total) * 100) };
  } catch {
    return { total: 0, present: 0, absent: 0, percentage: 0 };
  }
};

// ── Payments ──────────────────────────────────────────────────────────────────
const getPaymentSummary = async (studentId) => {
  try {
    const Payment = mongoose.model('Payment');
    const payments = await Payment
      .find({ student: studentId })
      .select('month requiredAmount paidAmount installments')
      .lean();

    const totalRequired = payments.reduce((s, p) => s + p.requiredAmount, 0);
    const totalPaid     = payments.reduce((s, p) => s + p.paidAmount,     0);

    return {
      totalRequired,
      totalPaid,
      totalRemaining: totalRequired - totalPaid,
      months:         payments.length,
      status:         totalRequired === totalPaid ? 'مكتمل' : 'غير مكتمل',
    };
  } catch {
    return { totalRequired: 0, totalPaid: 0, totalRemaining: 0, months: 0, status: 'غير محدد' };
  }
};

// ── Grades ────────────────────────────────────────────────────────────────────
const getGrades = async (studentId) => {
  try {
    const Grade = mongoose.model('Grade');
    const grades = await Grade
      .find({ student: studentId })
      .populate('exam', 'title maxScore examDate')
      .sort({ createdAt: -1 })
      .lean();

    const totalScore = grades.reduce((s, g) => s + g.score, 0);
    const totalMax   = grades.reduce((s, g) => s + (g.exam?.maxScore || 0), 0);

    return {
      list:        grades,
      totalScore,
      totalMax,
      percentage:  totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0,
      examCount:   grades.length,
    };
  } catch {
    return { list: [], totalScore: 0, totalMax: 0, percentage: 0, examCount: 0 };
  }
};

// ── Points ────────────────────────────────────────────────────────────────────
const getPointsBalance = async (studentId) => {
  try {
    const Point = mongoose.model('Point');
    const result = await Point.aggregate([
      { $match: { student: new mongoose.Types.ObjectId(studentId) } },
      {
        $group: {
          _id:     null,
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
        },
      },
    ]);

    return {
      balance:    result[0]?.balance    || 0,
      transactions: result[0]?.total || 0,
    };
  } catch {
    return { balance: 0, transactions: 0 };
  }
};

// ── Rank in academic year ─────────────────────────────────────────────────────
const getStudentRank = async (student) => {
  try {
    const Grade = mongoose.model('Grade');

    // Aggregate total scores for all students in same year
    const rankings = await Grade.aggregate([
      {
        $lookup: {
          from:         'users',
          localField:   'student',
          foreignField: '_id',
          as:           'studentData',
        },
      },
      { $unwind: '$studentData' },
      {
        $match: {
          'studentData.academicYear': student.academicYear,
          'studentData.isActive':     true,
        },
      },
      {
        $group: {
          _id:        '$student',
          totalScore: { $sum: '$score' },
        },
      },
      { $sort: { totalScore: -1 } },
    ]);

    const position = rankings.findIndex(
      (r) => r._id.toString() === student._id.toString()
    );

    const myTotal = rankings[position]?.totalScore || 0;

    return {
      rank:       position === -1 ? null : position + 1,
      totalScore: myTotal,
      outOf:      rankings.length,
    };
  } catch {
    return { rank: null, totalScore: 0, outOf: 0 };
  }
};

// ── Points-based rank in academic year ────────────────────────────────────────
// (separate from getStudentRank, which ranks by exam grades)
const getStudentPointsRank = async (student) => {
  try {
    const Point = mongoose.model('Point');
    const User  = mongoose.model('User');

    const peers = await User.find({
      role:         'student',
      academicYear: student.academicYear,
      isActive:     true,
    }).select('_id').lean();

    const peerIds = peers.map((p) => p._id);

    const balances = await Point.aggregate([
      { $match: { student: { $in: peerIds } } },
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
        },
      },
    ]);

    const balMap = new Map(balances.map((b) => [b._id.toString(), b.balance]));

    const sorted = peers
      .map((p) => ({ id: p._id.toString(), balance: balMap.get(p._id.toString()) || 0 }))
      .sort((a, b) => b.balance - a.balance);

    let rank = 1;
    let myRank = null;
    let myBalance = 0;
    sorted.forEach((r, i) => {
      if (i > 0 && r.balance < sorted[i - 1].balance) rank = i + 1;
      if (r.id === student._id.toString()) {
        myRank = rank;
        myBalance = r.balance;
      }
    });

    return {
      rank:    myRank,
      balance: myBalance,
      outOf:   peers.length,
    };
  } catch {
    return { rank: null, balance: 0, outOf: 0 };
  }
};

module.exports = { buildStudentReport };