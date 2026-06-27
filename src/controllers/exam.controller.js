// src/controllers/exam.controller.js — Full: MCQ, auto-grade, answer sheet

const Exam           = require('../models/Exam');
const ExamSubmission = require('../models/ExamSubmission');
const User           = require('../models/User');
const { cloudinary, uploadPDF } = require('../config/multer');
const { success, created, notFound, error: apiError } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/exams?year=&status= ──────────────────────────────────────────────
const getExams = asyncHandler(async (req, res) => {
  const { year, status } = req.query;
  const filter = {};
  if (year)   filter.academicYear = year;
  if (status) filter.status = status;

  const exams = await Exam.find(filter).sort({ examDate: -1, createdAt: -1 }).lean();

  // Attach submission count per exam
  const examIds = exams.map(e => e._id);
  const counts  = await ExamSubmission.aggregate([
    { $match: { exam: { $in: examIds } } },
    { $group: { _id: '$exam', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  counts.forEach(c => { countMap[c._id.toString()] = c.count; });

  return success(res, {
    exams: exams.map(e => ({ ...e, submissionsCount: countMap[e._id.toString()] || 0 })),
    total: exams.length,
  });
});

// ── GET /api/exams/:id ────────────────────────────────────────────────────────
const getExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id).lean();
  if (!exam) return notFound(res, 'الامتحان غير موجود');
  return success(res, { exam });
});

// ── POST /api/exams ───────────────────────────────────────────────────────────
const createExam = asyncHandler(async (req, res) => {
  const { title, academicYear, description, examDate, duration, status, questions, examType, maxScore } = req.body;
  const type = examType || 'electronic';

  // Validate electronic exam questions
  if (type === 'electronic' && questions && questions.length > 0) {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text?.trim()) return apiError(res, `السؤال ${i+1}: النص مطلوب`, 400);
      if (!['mcq','truefalse'].includes(q.type)) return apiError(res, `السؤال ${i+1}: النوع غير صحيح`, 400);
      if (q.type === 'truefalse') { q.options = ['صح', 'خطأ']; }
      if (!q.options || q.options.length < 2) return apiError(res, `السؤال ${i+1}: يجب أن يكون هناك خياران على الأقل`, 400);
      if (q.correctAnswer === undefined || q.correctAnswer === null) return apiError(res, `السؤال ${i+1}: حدد الإجابة الصحيحة`, 400);
      if (q.correctAnswer < 0 || q.correctAnswer >= q.options.length) return apiError(res, `السؤال ${i+1}: الإجابة الصحيحة غير صحيحة`, 400);
    }
  }

  const exam = await Exam.create({
    title, academicYear, description: description || null,
    examDate:  examDate  || null,
    duration:  duration  || null,
    status:    status    || 'draft',
    examType:  type,
    questions: type === 'electronic' ? (questions || []) : [],
    maxScore:  type === 'paper' ? (Number(maxScore) || 0) : 0,
    createdBy: req.user.userId,
  });

  return created(res, { exam }, 'تم إنشاء الامتحان بنجاح');
});

// ── PUT /api/exams/:id ────────────────────────────────────────────────────────
const updateExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  const { title, academicYear, description, examDate, duration, status, questions } = req.body;

  if (questions !== undefined) {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text?.trim()) return apiError(res, `السؤال ${i+1}: النص مطلوب`, 400);
      if (q.type === 'truefalse') q.options = ['صح', 'خطأ'];
      if (!q.options || q.options.length < 2) return apiError(res, `السؤال ${i+1}: يجب أن يكون هناك خياران على الأقل`, 400);
      if (q.correctAnswer === undefined || q.correctAnswer < 0 || q.correctAnswer >= q.options.length)
        return apiError(res, `السؤال ${i+1}: حدد الإجابة الصحيحة`, 400);
    }
    exam.questions = questions;
  }

  if (title       !== undefined) exam.title       = title;
  if (academicYear!== undefined) exam.academicYear= academicYear;
  if (description !== undefined) exam.description = description;
  if (examDate    !== undefined) exam.examDate    = examDate || null;
  if (duration    !== undefined) exam.duration    = duration || null;
  if (status      !== undefined) exam.status      = status;

  await exam.save();
  return success(res, { exam }, 'تم تعديل الامتحان بنجاح');
});

// ── DELETE /api/exams/:id ─────────────────────────────────────────────────────
const deleteExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  // Delete answer sheet from Cloudinary
  if (exam.answerSheetUrl) {
    try {
      const parts = exam.answerSheetUrl.split('/');
      const pubId = 'khatwa-plus/files/' + parts[parts.length-1].split('.')[0];
      await cloudinary.uploader.destroy(pubId, { resource_type: exam.answerSheetType === 'pdf' ? 'raw' : 'image' });
    } catch {}
  }

  await ExamSubmission.deleteMany({ exam: exam._id });
  await exam.deleteOne();
  return success(res, {}, 'تم حذف الامتحان بنجاح');
});

// ── PATCH /api/exams/:id/status ───────────────────────────────────────────────
const changeStatus = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');
  exam.status = req.body.status;
  await exam.save();
  return success(res, { exam }, 'تم تغيير حالة الامتحان');
});

// ── POST /api/exams/:id/answer-sheet ─────────────────────────────────────────
// Teacher uploads PDF or image answer sheet
const uploadAnswerSheet = asyncHandler(async (req, res) => {
  if (!req.file) return apiError(res, 'لم يتم رفع ملف', 400);

  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  // Delete old answer sheet
  if (exam.answerSheetUrl) {
    try {
      const parts = exam.answerSheetUrl.split('/');
      const pubId = 'khatwa-plus/files/' + parts[parts.length-1].split('.')[0];
      await cloudinary.uploader.destroy(pubId, { resource_type: 'raw' });
    } catch {}
  }

  const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'image';
  exam.answerSheetUrl  = req.file.path;
  exam.answerSheetType = fileType;
  await exam.save();

  return success(res, { answerSheetUrl: exam.answerSheetUrl, answerSheetType: fileType }, 'تم رفع نموذج الإجابة بنجاح');
});

// ── DELETE /api/exams/:id/answer-sheet ───────────────────────────────────────
const deleteAnswerSheet = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  if (exam.answerSheetUrl) {
    try {
      const parts = exam.answerSheetUrl.split('/');
      const pubId = 'khatwa-plus/files/' + parts[parts.length-1].split('.')[0];
      await cloudinary.uploader.destroy(pubId, { resource_type: exam.answerSheetType === 'pdf' ? 'raw' : 'image' });
    } catch {}
  }
  exam.answerSheetUrl  = null;
  exam.answerSheetType = null;
  await exam.save();
  return success(res, {}, 'تم حذف نموذج الإجابة');
});

// ── POST /api/exams/:id/submit (student) ─────────────────────────────────────
const submitExam = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;
  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');
  if (exam.status !== 'published') return apiError(res, 'الامتحان غير متاح حالياً', 403);

  // Check student's academic year matches
  const student = await User.findById(studentId).lean();
  if (!student || student.academicYear !== exam.academicYear)
    return apiError(res, 'هذا الامتحان غير مخصص لك', 403);

  // Check already submitted
  const existing = await ExamSubmission.findOne({ exam: exam._id, student: studentId });
  if (existing) return apiError(res, 'لقد حللت هذا الامتحان من قبل', 400);

  const { answers = [], timeTakenSeconds = 0 } = req.body;

  // Auto-grade
  let score = 0;
  const gradedAnswers = exam.questions.map(q => {
    const studentAnswer = answers.find(a => a.questionId?.toString() === q._id.toString());
    const chosen = studentAnswer?.chosenAnswer ?? null;
    const isCorrect = chosen !== null && chosen === q.correctAnswer;
    const earned = isCorrect ? (q.points || 1) : 0;
    score += earned;
    return {
      questionId:   q._id,
      chosenAnswer: chosen,
      isCorrect,
      pointsEarned: earned,
    };
  });

  const submission = await ExamSubmission.create({
    exam:       exam._id,
    student:    studentId,
    answers:    gradedAnswers,
    score,
    maxScore:   exam.maxScore,
    percentage: exam.maxScore > 0 ? Math.round((score / exam.maxScore) * 100) : 0,
    timeTakenSeconds,
    submittedAt: new Date(),
  });

  return created(res, { submission, score, maxScore: exam.maxScore }, 'تم تسليم الامتحان وتصحيحه تلقائياً');
});

// ── GET /api/exams/:id/results (teacher) ─────────────────────────────────────
const getResults = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id).lean();
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  const submissions = await ExamSubmission.find({ exam: exam._id })
    .populate('student', 'name codePlain academicYear')
    .sort({ score: -1 })
    .lean();

  const avg = submissions.length > 0
    ? Math.round(submissions.reduce((s, r) => s + r.score, 0) / submissions.length)
    : 0;

  return success(res, {
    exam: { _id: exam._id, title: exam.title, maxScore: exam.maxScore },
    submissions,
    summary: {
      total: submissions.length,
      average: avg,
      highest: submissions[0]?.score || 0,
      lowest:  submissions[submissions.length-1]?.score || 0,
    },
  });
});

// ── GET /api/exams/:id/my-result (student) ───────────────────────────────────
const getMyResult = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;
  const exam = await Exam.findById(req.params.id).lean();
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  const submission = await ExamSubmission.findOne({ exam: exam._id, student: studentId }).lean();

  return success(res, { exam, submission: submission || null });
});


// ── POST /api/exams/:id/paper-file (teacher) ─────────────────────────────────
const uploadPaperFile = asyncHandler(async (req, res) => {
  if (!req.file) return apiError(res, 'لم يتم رفع ملف', 400);

  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  // Delete old paper file if exists from Cloudinary
  if (exam.paperFileUrl) {
    try {
      const parts = exam.paperFileUrl.split('/');
      const pubId = parts[parts.length-2] + '/' + parts[parts.length-1].split('.')[0];
      await cloudinary.uploader.destroy(pubId, { resource_type: exam.paperFileType === 'pdf' ? 'raw' : 'image' });
    } catch {}
  }

  const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'image';
  exam.paperFileUrl  = req.file.path;
  exam.paperFileType = fileType;
  await exam.save();

  return success(res, { paperFileUrl: exam.paperFileUrl, paperFileType: fileType }, 'تم رفع ملف الامتحان بنجاح');
});

// ── DELETE /api/exams/:id/paper-file (teacher) ───────────────────────────────
const deletePaperFile = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  if (exam.paperFileUrl) {
    try {
      const parts = exam.paperFileUrl.split('/');
      const pubId = parts[parts.length-2] + '/' + parts[parts.length-1].split('.')[0];
      await cloudinary.uploader.destroy(pubId, { resource_type: exam.paperFileType === 'pdf' ? 'raw' : 'image' });
    } catch {}
  }

  exam.paperFileUrl = null; 
  exam.paperFileType = null;
  await exam.save();

  return success(res, {}, 'تم حذف ملف الامتحان');
});


module.exports = {
  getExams, getExam, createExam, updateExam, deleteExam,
  changeStatus, uploadAnswerSheet, deleteAnswerSheet,
  submitExam, getResults, getMyResult,uploadPaperFile, 
  deletePaperFile,
};