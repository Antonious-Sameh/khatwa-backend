// src/controllers/studentSelf.controller.js
// All endpoints here require role === 'student'.
// The student can only see their own data.

const mongoose  = require('mongoose');
const User      = require('../models/User');
const Attendance= require('../models/Attendance');
const Payment   = require('../models/Payment');
const Grade     = require('../models/Grade');
const Lesson    = require('../models/Lesson');
const WatchLog  = require('../models/WatchLog');
const Note      = require('../models/Note');
const Point     = require('../models/Point');
const Exam           = require('../models/Exam');
const ExamSubmission = require('../models/ExamSubmission');
const { buildStudentReport } = require('../services/report.service');
const { success, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/student/me ───────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  const student = await User
    .findById(req.user.userId)
    .populate('group', 'name academicYear days time')
    .lean();

  if (!student) return notFound(res, 'المستخدم غير موجود');
  delete student.refreshToken;

  return success(res, { student });
});

// ── GET /api/student/attendance ───────────────────────────────────────────────
const getMyAttendance = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 30 } = req.query;
  const studentId = req.user.userId;

  const filter = { student: studentId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to)   filter.date.$lte = to;
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Attendance.countDocuments(filter);

  const records = await Attendance
    .find(filter)
    .sort({ date: -1 })
    .skip(skip)
    .limit(Number(limit))
    .select('date status note')
    .lean();

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

  const s = stats[0] || { total: 0, present: 0, absent: 0 };

  return success(res, {
    records,
    summary: {
      total:      s.total,
      present:    s.present,
      absent:     s.absent,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    },
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
  });
});

// ── GET /api/student/payments ─────────────────────────────────────────────────
const getMyPayments = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;

  const payments = await Payment
    .find({ student: studentId })
    .sort({ createdAt: -1 })
    .lean();

  const totalRequired = payments.reduce((s, p) => s + p.requiredAmount, 0);
  const totalPaid     = payments.reduce((s, p) => s + p.paidAmount,     0);

  return success(res, {
    payments,
    summary: {
      totalRequired,
      totalPaid,
      totalRemaining: Math.max(0, totalRequired - totalPaid),
      status: totalRequired > 0 && totalPaid >= totalRequired ? 'مكتمل' : 'غير مكتمل',
    },
  });
});

// ── GET /api/student/grades ───────────────────────────────────────────────────
const getMyGrades = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;

  // ── 1. Manual grades entered by teacher (electronic-exam manual entries + paper exams) ──
  const manualGradesRaw = await Grade
    .find({ student: studentId })
    .populate('exam', 'title maxScore examDate academicYear status')
    .sort({ createdAt: -1 })
    .lean();

  // توحيد شكل البيانات للامتحانات الورقية والإلكترونية المدخلة يدويًا
  const manualGrades = manualGradesRaw.map(g => {
    const isPaper = g.examType === 'paper' || !g.exam;
    return {
      _id:        g._id,
      title:      isPaper ? (g.examTitle || 'امتحان ورقي') : (g.exam?.title || 'امتحان'),
      examType:   isPaper ? 'paper' : 'electronic',
      score:      g.score,
      maxScore:   isPaper ? (g.maxScore || 0) : (g.exam?.maxScore || 0),
      examDate:   g.exam?.examDate || null,
      note:       g.note || null,
      isAuto:     false,
      createdAt:  g.createdAt,
    };
  });

  // ── 2. Auto-graded submissions (electronic exams, MCQ) ────────────────────
  const ExamSubmission = mongoose.model('ExamSubmission');
  const submissions = await ExamSubmission
    .find({ student: studentId })
    .populate('exam', 'title maxScore examDate academicYear status')
    .sort({ submittedAt: -1 })
    .lean();

  // بناء قائمة بالـ IDs لمنع تكرار الامتحانات المدخلة يدويًا مع التلقائية
  const manualExamIds = new Set(
    manualGradesRaw.filter(g => g.exam).map(g => g.exam._id.toString())
  );

  const autoGrades = submissions
    .filter(s => s.exam && !manualExamIds.has(s.exam._id.toString()))
    .map(s => ({
      _id:        s._id,
      title:      s.exam?.title || 'امتحان',
      examType:   'electronic',
      score:      s.score,
      maxScore:   s.exam?.maxScore || 0,
      examDate:   s.exam?.examDate || null,
      note:       null,
      isAuto:     true,
      percentage: s.percentage,
      submittedAt: s.submittedAt,
      createdAt:  s.submittedAt,
    }));

  // ── 3. Merge both — sort by date desc ─────────────────────────────────────
  const allGrades = [...manualGrades, ...autoGrades]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const totalScore = allGrades.reduce((s, g) => s + (g.score || 0), 0);
  const totalMax   = allGrades.reduce((s, g) => s + (g.exam?.maxScore || 0), 0);

  return success(res, {
    grades: allGrades,
    summary: {
      examCount:  allGrades.length,
      totalScore,
      totalMax,
      percentage: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0,
    },
  });
});

// ── GET /api/student/points ───────────────────────────────────────────────────
const getMyPoints = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;
  const { page = 1, limit = 20 } = req.query;

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Point.countDocuments({ student: studentId });

  const transactions = await Point
    .find({ student: studentId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const balanceAgg = await Point.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id: null,
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

  // Also compute rank in leaderboard
  const allStudents = await User.find({ 
    role: 'student', 
    academicYear: (await User.findById(studentId).select('academicYear').lean())?.academicYear, 
    isActive: true 
  }).select('_id').lean();

  const allBalances = await Point.aggregate([
    { $match: { student: { $in: allStudents.map(s => s._id) } } },
    { $group: { _id: '$student', bal: { $sum: { $cond: [{ $eq: ['$type', 'add'] }, '$amount', { $multiply: ['$amount', -1] }] } } } },
  ]);

  const balMap = new Map(allBalances.map(r => [r._id.toString(), r.bal]));
  const sorted = allStudents.map(s => ({ id: s._id.toString(), bal: balMap.get(s._id.toString()) || 0 })).sort((a, b) => b.bal - a.bal);

  let myRank = null;
  let curRank = 1;
  sorted.forEach((r, i) => { 
    if (i > 0 && r.bal < sorted[i - 1].bal) curRank = i + 1; 
    if (r.id === studentId.toString()) myRank = curRank; 
  });

  return success(res, {
    balance:      balanceAgg[0]?.balance || 0,
    transactions,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    rank:  myRank,
    outOf: allStudents.length,
  });
});

// ── GET /api/student/rank ─────────────────────────────────────────────────────
const getMyRank = asyncHandler(async (req, res) => {
  const student = await User.findById(req.user.userId).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const year = student.academicYear;

  // ── Scores from electronic exams (ExamSubmission) ────────────────────────
  const electronicExams = await Exam.find({
    academicYear: year, status: { $ne: 'draft' },
    $or: [{ examType: 'electronic' }, { examType: { $exists: false } }],
  }).select('_id maxScore').lean();

  const myElecSubs = await ExamSubmission.find({
    exam: { $in: electronicExams.map(e=>e._id) }, student: req.user.userId,
  }).select('exam score').lean();

  const myElecScore = myElecSubs.reduce((s,x)=>s+x.score,0);
  const myElecMax   = electronicExams.reduce((s,e)=>s+(e.maxScore||0),0);

  // ── All students' electronic scores for ranking ───────────────────────────
  const allSubs = await ExamSubmission.find({
    exam: { $in: electronicExams.map(e=>e._id) },
  }).select('student exam score').lean();

  const elecMap = new Map();
  allSubs.forEach(s => {
    const cur = elecMap.get(s.student.toString()) || 0;
    elecMap.set(s.student.toString(), cur + s.score);
  });

  const allStudents = await User.find({ role:'student', academicYear:year, isActive:true }).select('_id').lean();

  const sorted = allStudents
    .map(s => ({ id:s._id.toString(), score: elecMap.get(s._id.toString())||0 }))
    .sort((a,b)=>b.score-a.score);

  let rank = 1;
  sorted.forEach((r,i) => {
    if(i>0 && r.score < sorted[i-1].score) rank = i+1;
    r.rank = rank;
  });

  const myEntry = sorted.find(r=>r.id===req.user.userId.toString());

  return success(res, {
    rank:       myEntry?.rank       || null,
    totalScore: myElecScore,
    totalMax:   myElecMax,
    outOf:      allStudents.length,
    percentage: myElecMax > 0 ? Math.round((myElecScore/myElecMax)*100) : 0,
  });
});

// ── GET /api/student/notes ────────────────────────────────────────────────────
const getMyNotes = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;
  const student   = await User.findById(studentId).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const [generalNotes, privateNotes] = await Promise.all([
    Note.find({ type: 'general', academicYear: student.academicYear })
        .sort({ createdAt: -1 }).lean(),
    Note.find({ type: 'private', student: studentId })
        .sort({ createdAt: -1 }).lean(),
  ]);

  // Attach isRead per note for this student
  // التعديل الجديد: التحقق من القراءة وإضافة حقل isRead
  const withRead = (notes) => notes.map(n => ({
    ...n,
    isRead: (n.readBy || []).some(id => id.toString() === studentId.toString()),
  }));

  const generalWithRead = withRead(generalNotes);
  const privateWithRead = withRead(privateNotes);

  // حساب الملاحظات غير المقروءة
  const unreadCount =
    generalWithRead.filter(n => !n.isRead).length +
    privateWithRead.filter(n => !n.isRead).length;

  return success(res, {
    generalNotes: generalWithRead,
    privateNotes: privateWithRead,
    unreadCount,
  });
});

// ── GET /api/student/lessons ──────────────────────────────────────────────────
// Returns published lessons for student's academic year with watch status.
const getMyLessons = asyncHandler(async (req, res) => {
  const student = await User.findById(req.user.userId).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const { type } = req.query;
  const filter = { academicYear: student.academicYear, published: true };
  if (type) filter.type = type;

  const lessons = await Lesson.find(filter).sort({ order: 1 }).lean();

  // 1. حماية رابط الفيديو الخام من السرقة
  lessons.forEach(l => { delete l.videoUrl; });

  // جلب سجلات المشاهدة للطالب
  const lessonIds = lessons.map((l) => l._id);
  const watchLogs = await WatchLog
    .find({ student: req.user.userId, lesson: { $in: lessonIds } })
    .select('lesson watchedAt completed watchDuration watchPercentage playCount')
    .lean();

  const watchMap = {};
  watchLogs.forEach((w) => { watchMap[w.lesson.toString()] = w; });

  // 2. التعديل الجديد: تجميع حقول المشاهدة داخل كائن watchLog فرعي
  const enriched = lessons.map((l) => {
    const log = watchMap[l._id.toString()];
    return {
      ...l,
      watchLog: log ? {
        watched:         true,
        watchedAt:       log.watchedAt,
        completed:       log.completed       || false,
        watchDuration:   log.watchDuration   || 0,
        watchPercentage: log.watchPercentage || 0,
        playCount:       log.playCount       || 0,
      } : null,
    };
  });

  // حساب عدد الدروس التي تم مشاهدتها (لو الكائن watchLog موجود معناه تمت المشاهدة)
  const watchedCount = enriched.filter((l) => l.watchLog !== null).length;

  return success(res, {
    lessons: enriched,
    total:   enriched.length,
    progress: {
      watched: watchedCount,
      total:   enriched.length,
      percentage: enriched.length > 0
        ? Math.round((watchedCount / enriched.length) * 100)
        : 0,
    },
  });
});

// ── GET /api/student/report ───────────────────────────────────────────────────
const getMyReport = asyncHandler(async (req, res) => {
  const student = await User
    .findById(req.user.userId)
    .populate('group', 'name academicYear')
    .lean();

  if (!student) return notFound(res, 'الطالب غير موجود');

  const report = await buildStudentReport(student);
  return success(res, { report });
});

module.exports = {
  getMe,
  getMyAttendance,
  getMyPayments,
  getMyGrades,
  getMyPoints,
  getMyRank,
  getMyNotes,
  getMyLessons,
  getMyReport,
};