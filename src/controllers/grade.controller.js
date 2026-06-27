// src/controllers/grade.controller.js

const mongoose = require('mongoose');
const Grade    = require('../models/Grade');
const Exam     = require('../models/Exam');
const User     = require('../models/User');
const ExamSubmission = require('../models/ExamSubmission');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/grades?exam= ─────────────────────────────────────────────────────
// Full grade sheet for an exam — all students in the exam's year.
const getExamGrades = asyncHandler(async (req, res) => {
  const { exam: examId } = req.query;
  if (!examId) return error(res, 'معرف الامتحان مطلوب', 400);

  const exam = await Exam.findById(examId).lean();
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  // All students in the same academic year
  const students = await User
    .find({ role: 'student', academicYear: exam.academicYear, isActive: true })
    .select('_id name codePlain group')
    .populate('group', 'name')
    .sort({ name: 1 })
    .lean();

  // Existing grades for this exam
  const grades = await Grade
    .find({ exam: examId })
    .select('student score note correctedBy createdAt')
    .lean();

  const gradeMap = {};
  grades.forEach((g) => { gradeMap[g.student.toString()] = g; });

  // Merge: every student shows their grade or null
  const sheet = students.map((s) => {
    const g = gradeMap[s._id.toString()];
    return {
      student:   s,
      gradeId:   g?._id   || null,
      score:     g?.score  ?? null,
      note:      g?.note   || null,
      entered:   !!g,
    };
  });

  const entered   = sheet.filter((r) => r.entered).length;
  const avgScore  = entered > 0
    ? (sheet.filter((r) => r.entered).reduce((s, r) => s + r.score, 0) / entered).toFixed(1)
    : 0;
  const highest   = entered > 0 ? Math.max(...sheet.filter((r) => r.entered).map((r) => r.score)) : 0;
  const lowest    = entered > 0 ? Math.min(...sheet.filter((r) => r.entered).map((r) => r.score)) : 0;

  return success(res, {
    exam,
    sheet,
    summary: {
      total:   students.length,
      entered,
      pending: students.length - entered,
      avgScore: Number(avgScore),
      highest,
      lowest,
    },
  });
});

// ── POST /api/grades ──────────────────────────────────────────────────────────
// Enter or update a single grade (upsert).
const enterGrade = asyncHandler(async (req, res) => {
  const { studentId, examId, score, note } = req.body;
  const teacherId = req.user.userId;

  const [student, exam] = await Promise.all([
    User.findOne({ _id: studentId, role: 'student' }).lean(),
    Exam.findById(examId).lean(),
  ]);

  if (!student) return notFound(res, 'الطالب غير موجود');
  if (!exam)    return notFound(res, 'الامتحان غير موجود');

  if (exam.status === 'closed') {
    return error(res, 'لا يمكن إدخال درجات لامتحان مغلق', 400);
  }
  if (score > exam.maxScore) {
    return error(res, `الدرجة (${score}) أكبر من الدرجة الكاملة (${exam.maxScore})`, 400);
  }

  const grade = await Grade.findOneAndUpdate(
    { student: studentId, exam: examId },
    {
      $set: {
        score,
        note:        note || null,
        correctedBy: teacherId,
      },
    },
    { upsert: true, new: true, runValidators: false }
  );

  return success(res, { grade }, 'تم حفظ الدرجة بنجاح');
});

// ── POST /api/grades/bulk ─────────────────────────────────────────────────────
// Bulk upsert grades for an entire exam — one request for the whole sheet.
const bulkEnterGrades = asyncHandler(async (req, res) => {
  const { examId, grades } = req.body;
  const teacherId = req.user.userId;

  const exam = await Exam.findById(examId).lean();
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  if (exam.status === 'closed') {
    return error(res, 'لا يمكن إدخال درجات لامتحان مغلق', 400);
  }

  // Validate all scores within range
  const invalid = grades.filter((g) => g.score > exam.maxScore);
  if (invalid.length > 0) {
    return error(
      res,
      `${invalid.length} درجة تتجاوز الدرجة الكاملة (${exam.maxScore})`,
      400
    );
  }

  const ops = grades.map(({ studentId, score, note }) => ({
    updateOne: {
      filter: { student: studentId, exam: examId },
      update: {
        $set: {
          score,
          note:        note || null,
          correctedBy: teacherId,
        },
      },
      upsert: true,
    },
  }));

  const result = await Grade.bulkWrite(ops, { ordered: false });

  return success(res, {
    examId,
    submitted: grades.length,
    inserted:  result.upsertedCount,
    updated:   result.modifiedCount,
  }, `تم حفظ ${grades.length} درجة بنجاح`);
});

// ── PUT /api/grades/:id ───────────────────────────────────────────────────────
const updateGrade = asyncHandler(async (req, res) => {
  const { score, note } = req.body;

  const grade = await Grade.findById(req.params.id).populate('exam', 'maxScore status');
  if (!grade) return notFound(res, 'الدرجة غير موجودة');

  if (grade.exam?.status === 'closed') {
    return error(res, 'لا يمكن تعديل درجات امتحان مغلق', 400);
  }
  if (score > grade.exam?.maxScore) {
    return error(res, `الدرجة (${score}) أكبر من الدرجة الكاملة (${grade.exam.maxScore})`, 400);
  }

  grade.score        = score;
  grade.note         = note || null;
  grade.correctedBy  = req.user.userId;
  await grade.save();

  return success(res, { grade }, 'تم تعديل الدرجة بنجاح');
});

// ── GET /api/grades/student/:studentId ───────────────────────────────────────
// All grades for a student across all exams.
const getStudentGrades = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.studentId, role: 'student' }).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const grades = await Grade
    .find({ student: req.params.studentId })
    .populate('exam', 'title maxScore examDate academicYear status')
    .sort({ createdAt: -1 })
    .lean();

  const totalScore = grades.reduce((s, g) => s + g.score, 0);
  const totalMax   = grades.reduce((s, g) => s + (g.exam?.maxScore || 0), 0);

  return success(res, {
    student: { _id: student._id, name: student.name, academicYear: student.academicYear },
    grades,
    summary: {
      examCount:  grades.length,
      totalScore,
      totalMax,
      percentage: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0,
    },
  });
});

// ── GET /api/grades/rankings?year= ────────────────────────────────────────────
// Ranks students in an academic year by total score — descending.
// ── GET /api/grades/rankings?year= ────────────────────────────────────────────
// ترتيب الطلاب بدمج الدرجات اليدوية + تسليمات التصحيح التلقائي
const getRankings = asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year) return error(res, 'السنة الدراسية مطلوبة', 400);

  // المصدر الأول: الدرجات اليدوية الرشيدة من المعلم
  const manualAgg = await Grade.aggregate([
    { $lookup: { from: 'exams', localField: 'exam', foreignField: '_id', as: 'examData' } },
    { $unwind: '$examData' },
    { $match: { 'examData.academicYear': year, 'examData.status': { $ne: 'draft' } } },
    { $group: { _id: { student: '$student', exam: '$exam' }, score: { $first: '$score' }, maxScore: { $first: '$examData.maxScore' } } },
    { $group: { _id: '$_id.student', totalScore: { $sum: '$score' }, totalMax: { $sum: '$maxScore' }, examCount: { $sum: 1 } } },
  ]);

  // المصدر الثاني: الامتحانات الإلكترونية الأوتوماتيكية
  const autoAgg = await ExamSubmission.aggregate([
    { $lookup: { from: 'exams', localField: 'exam', foreignField: '_id', as: 'examData' } },
    { $unwind: '$examData' },
    { $match: { 'examData.academicYear': year, 'examData.status': { $ne: 'draft' } } },
    { $group: { _id: { student: '$student', exam: '$exam' }, score: { $first: '$score' }, maxScore: { $first: '$examData.maxScore' } } },
    { $group: { _id: '$_id.student', totalScore: { $sum: '$score' }, totalMax: { $sum: '$maxScore' }, examCount: { $sum: 1 } } },
  ]);

  // دمج المجموعين معاً بذكاء في Map
  const scoreMap = new Map();
  autoAgg.forEach(r => scoreMap.set(r._id.toString(), { totalScore: r.totalScore, totalMax: r.totalMax, examCount: r.examCount }));
  
  manualAgg.forEach(r => {
    const ex = scoreMap.get(r._id.toString()) || { totalScore: 0, totalMax: 0, examCount: 0 };
    scoreMap.set(r._id.toString(), {
      totalScore: ex.totalScore + r.totalScore,
      totalMax:   ex.totalMax   + r.totalMax,
      examCount:  ex.examCount  + r.examCount,
    });
  });

  // جلب كافة الطلاب النشطين لهذه السنة الدراسية بربط مجموعاتهم
  const students = await User
    .find({ role: 'student', academicYear: year, isActive: true })
    .select('_id name codePlain group avatar')
    .populate('group', 'name')
    .lean();

  // حساب النسبة المئوية والترتيب التنازلي من الأعلى للأقل درجات
  const ranked = students
    .map(s => {
      const d = scoreMap.get(s._id.toString()) || { totalScore: 0, totalMax: 0, examCount: 0 };
      return {
        student:    s,
        totalScore: d.totalScore,
        totalMax:   d.totalMax,
        examCount:  d.examCount,
        percentage: d.totalMax > 0 ? Math.round((d.totalScore / d.totalMax) * 100) : 0,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  // تعيين الرتبة (Rank) مع معالجة المتساويين في النتيجة (Ties)
  let currentRank = 1;
  ranked.forEach((r, i) => {
    if (i > 0 && r.totalScore < ranked[i-1].totalScore) currentRank = i + 1;
    r.rank = currentRank;
  });

  return success(res, { year, total: ranked.length, rankings: ranked });
});

// ══════════════════════════════════════════════════════════════════════════════
// PAPER EXAM GRADES — create exam entry + bulk enter scores
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/grades/paper-exams?year= ─────────────────────────────────────────
// List all paper exam "headers" (distinct examTitle per year)
const getPaperExams = asyncHandler(async (req, res) => {
  const { year } = req.query;
  if (!year) return error(res, 'السنة الدراسية مطلوبة', 400);

  const groups = await Grade.aggregate([
    { $match: { examType: 'paper', exam: null } },
    {
      $lookup: {
        from: 'users', localField: 'student', foreignField: '_id',
        as: 'studentData',
      },
    },
    { $unwind: '$studentData' },
    { $match: { 'studentData.academicYear': year } },
    {
      $group: {
        _id: '$examTitle',
        maxScore:    { $first: '$maxScore' },
        studentCount:{ $sum: 1 },
        createdAt:   { $first: '$createdAt' },
        ids:         { $push: '$_id' },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  return success(res, { paperExams: groups, total: groups.length });
});

// ── GET /api/grades/paper-exam-sheet?year=&title= ────────────────────────────
// Get all students + their grades for a specific paper exam
const getPaperExamSheet = asyncHandler(async (req, res) => {
  const { year, title } = req.query;
  if (!year||!title) return error(res, 'السنة والعنوان مطلوبان', 400);

  const students = await User
    .find({ role:'student', academicYear:year, isActive:true })
    .select('_id name codePlain group')
    .populate('group','name')
    .sort({ name:1 }).lean();

  const grades = await Grade.find({ examType:'paper', exam:null, examTitle:title }).lean();
  const gradeMap = {};
  grades.forEach(g => { gradeMap[g.student.toString()] = g; });

  const maxScore = grades[0]?.maxScore || 0;

  const sheet = students.map(s => ({
    student: s,
    gradeId: gradeMap[s._id.toString()]?._id || null,
    score:   gradeMap[s._id.toString()]?.score ?? null,
    entered: !!gradeMap[s._id.toString()],
  }));

  return success(res, { title, maxScore, year, sheet });
});

// ── POST /api/grades/paper-exam ────────────────────────────────────────────────
// Create a new paper exam header (just stores first batch of empty grades)
const createPaperExam = asyncHandler(async (req, res) => {
  const { title, maxScore, academicYear } = req.body;
  if (!title?.trim()||!academicYear) return error(res, 'الاسم والمرحلة مطلوبان', 400);

  // Check not duplicate
  const students = await User
    .find({ role:'student', academicYear, isActive:true })
    .select('_id').lean();

  if (!students.length) return error(res, 'لا يوجد طلاب في هذه المرحلة', 400);

  // Create placeholder grade rows so the exam "exists"
  const ops = students.map(s => ({
    updateOne: {
      filter: { student:s._id, examType:'paper', exam:null, examTitle:title.trim() },
      update: { $setOnInsert: { student:s._id, examType:'paper', exam:null, examTitle:title.trim(), maxScore:Number(maxScore)||0, score:0, correctedBy:null } },
      upsert: true,
    },
  }));
  await Grade.bulkWrite(ops);

  return created(res, { title:title.trim(), maxScore:Number(maxScore)||0, academicYear }, 'تم إنشاء الامتحان الورقي');
});

// ── POST /api/grades/paper-exam-bulk ─────────────────────────────────────────
// Bulk upsert scores for a paper exam
const bulkPaperGrades = asyncHandler(async (req, res) => {
  const { title, maxScore, academicYear, grades: gradeList } = req.body;
  if (!title||!gradeList?.length) return error(res, 'البيانات ناقصة', 400);

  const ops = gradeList.map(g => ({
    updateOne: {
      filter: { student:g.studentId, examType:'paper', exam:null, examTitle:title },
      update: { $set: { score:Number(g.score)||0, maxScore:Number(maxScore)||0, correctedBy:null } },
      upsert: true,
    },
  }));
  await Grade.bulkWrite(ops);
  return success(res, {}, 'تم حفظ الدرجات بنجاح');
});

// ── DELETE /api/grades/paper-exam ─────────────────────────────────────────────
const deletePaperExam = asyncHandler(async (req, res) => {
  const { title, year } = req.query;
  if (!title||!year) return error(res, 'العنوان والمرحلة مطلوبان', 400);
  const students = await User.find({ role:'student', academicYear:year }).select('_id').lean();
  const ids = students.map(s=>s._id);
  await Grade.deleteMany({ examType:'paper', exam:null, examTitle:title, student:{ $in:ids } });
  return success(res, {}, 'تم حذف الامتحان الورقي وجميع درجاته');
});

module.exports = {
  getExamGrades,
  enterGrade,
  bulkEnterGrades,
  updateGrade,
  getStudentGrades,
  getRankings,
  getPaperExams,
  getPaperExamSheet,
  createPaperExam,
  bulkPaperGrades,
  deletePaperExam,
};