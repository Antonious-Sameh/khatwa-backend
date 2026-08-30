// src/controllers/exam.controller.js — Full: MCQ, auto-grade, answer sheet

const Exam           = require('../models/Exam');
const ExamSubmission = require('../models/ExamSubmission');
const ExamRetake     = require('../models/ExamRetake');
const User           = require('../models/User');
const { cloudinary, uploadPDF } = require('../config/multer');
const { success, created, notFound, error: apiError } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── Helper: extract Cloudinary public_id from secure_url ─────────────────────
// Cloudinary URL format: https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<public_id>.<ext>
// The public_id may contain slashes (folder/subfolder/filename).
// We strip: protocol, host, resource_type, "upload", version segment, and extension.
const extractPublicId = (url) => {
  if (!url) return null;
  try {
    // Remove query string if any
    const clean = url.split('?')[0];
    // Split on '/upload/'
    const uploadIdx = clean.indexOf('/upload/');
    if (uploadIdx === -1) return null;
    let after = clean.slice(uploadIdx + '/upload/'.length);
    // Remove optional version prefix (v1234567/)
    after = after.replace(/^v\d+\//, '');
    // Remove file extension
    after = after.replace(/\.[^/.]+$/, '');
    return after;
  } catch {
    return null;
  }
};

// ── Helper: delete a file from Cloudinary safely (never throws) ────────────
const destroyFromCloudinary = async (url, resourceType = 'image') => {
  const pubId = extractPublicId(url);
  if (!pubId) return;
  // Try with the given type first, then fall back to 'raw' for old files
  // uploaded before we switched to resource_type: 'auto'
  try {
    const result = await cloudinary.uploader.destroy(pubId, { resource_type: resourceType });
    if (result.result === 'not found') {
      // Old file stored as 'raw' — try again
      await cloudinary.uploader.destroy(pubId, { resource_type: 'raw' });
    }
  } catch {}
};

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

  // Delete answer sheet(s) from Cloudinary, the submissions, and the exam
  // document itself. destroyFromCloudinary never throws (errors are
  // swallowed inside it) and none of these operations depend on each
  // other's result, so they can all run in parallel instead of one by one.
  const sheets = exam.answerSheets && exam.answerSheets.length
    ? exam.answerSheets
    : (exam.answerSheetUrl ? [{ url: exam.answerSheetUrl, type: exam.answerSheetType }] : []);

  await Promise.all([
    ...sheets.map((sheet) => destroyFromCloudinary(sheet.url, sheet.type === 'pdf' ? 'raw' : 'image')),
    ExamSubmission.deleteMany({ exam: exam._id }),
    exam.deleteOne(),
  ]);
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
// Teacher uploads one or more PDF/image answer sheets.
// Existing answer sheets are kept — new files are appended, not replaced.
const uploadAnswerSheet = asyncHandler(async (req, res) => {
  const files = req.files && req.files.length ? req.files : (req.file ? [req.file] : []);
  if (!files.length) return apiError(res, 'لم يتم رفع أي ملف', 400);

  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  const newSheets = files.map((f) => ({
    url:  f.path,
    type: f.mimetype === 'application/pdf' ? 'pdf' : 'image',
  }));

  exam.answerSheets = [...(exam.answerSheets || []), ...newSheets];

  // Keep legacy single-file fields in sync (point to the most recent sheet)
  const last = exam.answerSheets[exam.answerSheets.length - 1];
  exam.answerSheetUrl  = last.url;
  exam.answerSheetType = last.type;

  await exam.save();

  return success(res, { answerSheets: exam.answerSheets }, 'تم رفع نموذج الإجابة بنجاح');
});

// ── DELETE /api/exams/:id/answer-sheet/:sheetId ──────────────────────────────
// Deletes a single answer sheet by its sub-document id.
const deleteAnswerSheet = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  const { sheetId } = req.params;

  // Backward-compat: no sheetId provided → clear everything (old behaviour)
  if (!sheetId) {
    // Independent Cloudinary deletions — no need to wait for each one
    // before starting the next.
    await Promise.all(
      (exam.answerSheets || []).map((sheet) =>
        destroyFromCloudinary(sheet.url, sheet.type === 'pdf' ? 'raw' : 'image')
      )
    );
    exam.answerSheets    = [];
    exam.answerSheetUrl  = null;
    exam.answerSheetType = null;
    await exam.save();
    return success(res, {}, 'تم حذف كل نماذج الإجابة');
  }

  const sheet = exam.answerSheets.id(sheetId);
  if (!sheet) return notFound(res, 'نموذج الإجابة غير موجود');

  await destroyFromCloudinary(sheet.url, sheet.type === 'pdf' ? 'raw' : 'image');

  exam.answerSheets.pull(sheetId);

  // Keep legacy fields in sync
  const last = exam.answerSheets[exam.answerSheets.length - 1] || null;
  exam.answerSheetUrl  = last?.url  || null;
  exam.answerSheetType = last?.type || null;

  await exam.save();
  return success(res, { answerSheets: exam.answerSheets }, 'تم حذف نموذج الإجابة');
});

// ── POST /api/exams/:id/submit (student) ─────────────────────────────────────
const submitExam = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;

  // The exam, the student, and any prior submission are independent lookups
  // (the "existing submission" filter only needs the id from the URL, not
  // the loaded exam document) — fetch all three in parallel, then validate
  // in the same order as before.
  const [exam, student, latestSubmission] = await Promise.all([
    Exam.findById(req.params.id),
    User.findById(studentId).lean(),
    // Latest attempt so far (if any) — sort descending by attemptNumber.
    ExamSubmission.findOne({ exam: req.params.id, student: studentId }).sort({ attemptNumber: -1 }),
  ]);

  if (!exam) return notFound(res, 'الامتحان غير موجود');
  if (exam.status !== 'published') return apiError(res, 'الامتحان غير متاح حالياً', 403);

  // Check student's academic year matches
  if (!student || student.academicYear !== exam.academicYear)
    return apiError(res, 'هذا الامتحان غير مخصص لك', 403);

  // Check already submitted — a second (or later) attempt is only allowed
  // when a teacher has explicitly granted a retake for this student. The
  // previous submission is never touched; the new one gets the next
  // attemptNumber and lives alongside it.
  let attemptNumber = 1;
  let retakeGrant = null;
  if (latestSubmission) {
    retakeGrant = await ExamRetake.findOne({ exam: req.params.id, student: studentId, status: 'pending' });
    if (!retakeGrant) return apiError(res, 'لقد حللت هذا الامتحان من قبل', 400);
    attemptNumber = latestSubmission.attemptNumber + 1;
  }

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
    attemptNumber,
  });

  // Consume the retake grant now that the new attempt exists.
  if (retakeGrant) {
    retakeGrant.status = 'used';
    retakeGrant.usedAt = new Date();
    await retakeGrant.save();
  }

  return created(res, { submission, score, maxScore: exam.maxScore }, 'تم تسليم الامتحان وتصحيحه تلقائياً');
});

// ── GET /api/exams/:id/results (teacher) ─────────────────────────────────────
const getResults = asyncHandler(async (req, res) => {
  // submissions only need the id from the URL, not the loaded exam document,
  // so both queries can run in parallel.
  const [exam, allSubmissions, pendingRetakes] = await Promise.all([
    Exam.findById(req.params.id).lean(),
    ExamSubmission.find({ exam: req.params.id })
      .populate('student', 'name codePlain academicYear')
      .sort({ attemptNumber: -1 })
      .lean(),
    ExamRetake.find({ exam: req.params.id, status: 'pending' }).select('student').lean(),
  ]);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  // A student may have more than one attempt when a teacher granted a
  // retake. The main list should show each student once, with their LATEST
  // attempt — older attempts stay in the database untouched (visible via
  // getSubmissionDetail with ?attempt=N) but don't clutter this summary.
  const seen = new Set();
  const submissions = [];
  for (const s of allSubmissions) {
    const sid = (s.student?._id || s.student)?.toString();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    submissions.push(s);
  }
  submissions.sort((a, b) => b.score - a.score);

  const avg = submissions.length > 0
    ? Math.round(submissions.reduce((s, r) => s + r.score, 0) / submissions.length)
    : 0;

  return success(res, {
    exam: { _id: exam._id, title: exam.title, maxScore: exam.maxScore },
    submissions,
    totalAttempts: allSubmissions.length,
    pendingRetakeStudentIds: pendingRetakes.map(r => r.student.toString()),
    summary: {
      total: submissions.length,
      average: avg,
      highest: submissions[0]?.score || 0,
      lowest:  submissions[submissions.length-1]?.score || 0,
    },
  });
});

// ── GET /api/exams/:id/results/:studentId (teacher) ───────────────────────────
// Full detail of a single student's attempt: the complete exam (questions with
// text/options/imageUrl/correctAnswer) plus that student's submission (chosen
// answers, correctness, points). Purely additive — does not change submitExam,
// getResults, or getMyResult, and does not touch the grading logic itself.
// Optional ?attempt=N query lets the teacher look at an older attempt; by
// default it returns the student's latest one.
const getSubmissionDetail = asyncHandler(async (req, res) => {
  const { attempt } = req.query;
  const filter = { exam: req.params.id, student: req.params.studentId };
  if (attempt) filter.attemptNumber = Number(attempt);

  const [exam, submission, totalAttempts] = await Promise.all([
    Exam.findById(req.params.id).lean(),
    ExamSubmission.findOne(filter)
      .populate('student', 'name codePlain academicYear')
      .sort({ attemptNumber: -1 })
      .lean(),
    ExamSubmission.countDocuments({ exam: req.params.id, student: req.params.studentId }),
  ]);
  if (!exam) return notFound(res, 'الامتحان غير موجود');
  if (!submission) return notFound(res, 'لا توجد محاولة لهذا الطالب في هذا الامتحان');

  return success(res, { exam, submission, totalAttempts });
});

// ── GET /api/exams/:id/my-result (student) ───────────────────────────────────
const getMyResult = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;

  // The submission lookup only needs the id from the URL, not the loaded
  // exam document, so both queries can run in parallel.
  const [exam, submissions, retakeGrant] = await Promise.all([
    Exam.findById(req.params.id).lean(),
    ExamSubmission.find({ exam: req.params.id, student: studentId }).sort({ attemptNumber: 1 }).lean(),
    ExamRetake.findOne({ exam: req.params.id, student: studentId, status: 'pending' }).lean(),
  ]);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  const submission = submissions.length ? submissions[submissions.length - 1] : null;

  return success(res, {
    exam,
    submission: submission || null,
    // Additive fields only — existing callers that just read `submission`
    // keep working exactly as before.
    previousAttempts: submissions.length > 1 ? submissions.slice(0, -1) : [],
    canRetake: !!retakeGrant,
  });
});

// ── POST /api/exams/:id/retake (teacher) ──────────────────────────────────────
// Grants ONE specific student permission to submit another attempt at this
// exam. Does not affect any other student, and never deletes/modifies the
// student's previous submission — it only unlocks the next attemptNumber for
// them (consumed by submitExam once they actually submit again).
const grantRetake = asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return apiError(res, 'معرف الطالب مطلوب', 400);

  const [exam, student] = await Promise.all([
    Exam.findById(req.params.id).lean(),
    User.findById(studentId).lean(),
  ]);
  if (!exam) return notFound(res, 'الامتحان غير موجود');
  if (exam.examType !== 'electronic') return apiError(res, 'إعادة الامتحان متاحة فقط للامتحانات الإلكترونية', 400);
  if (!student || student.role !== 'student') return notFound(res, 'الطالب غير موجود');
  if (student.academicYear !== exam.academicYear) return apiError(res, 'هذا الطالب ليس من نفس صف الامتحان', 400);

  // Idempotent: reuse an already-pending grant instead of creating a
  // duplicate one if the teacher clicks retake twice.
  let grant = await ExamRetake.findOne({ exam: exam._id, student: studentId, status: 'pending' });
  if (!grant) {
    grant = await ExamRetake.create({
      exam:      exam._id,
      student:   studentId,
      grantedBy: req.user.userId,
      status:    'pending',
    });
  }

  return created(res, { retake: grant }, 'تم منح الطالب محاولة جديدة للامتحان');
});


// ── POST /api/exams/:id/paper-file (teacher) ─────────────────────────────────
const uploadPaperFile = asyncHandler(async (req, res) => {
  if (!req.file) return apiError(res, 'لم يتم رفع ملف', 400);

  const exam = await Exam.findById(req.params.id);
  if (!exam) return notFound(res, 'الامتحان غير موجود');

  // Delete old paper file if exists from Cloudinary
  if (exam.paperFileUrl) {
    await destroyFromCloudinary(exam.paperFileUrl, exam.paperFileType === 'pdf' ? 'raw' : 'image');
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
    await destroyFromCloudinary(exam.paperFileUrl, exam.paperFileType === 'pdf' ? 'raw' : 'image');
  }

  exam.paperFileUrl = null; 
  exam.paperFileType = null;
  await exam.save();

  return success(res, {}, 'تم حذف ملف الامتحان');
});


module.exports = {
  getExams, getExam, createExam, updateExam, deleteExam,
  changeStatus, uploadAnswerSheet, deleteAnswerSheet,
  submitExam, getResults, getMyResult, getSubmissionDetail, uploadPaperFile, 
  deletePaperFile, grantRetake,
};