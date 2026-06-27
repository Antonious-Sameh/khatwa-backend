// src/routes/grade.routes.js

const express = require('express');
const router  = express.Router();

const {
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
} = require('../controllers/grade.controller');

// استيراد protect و isTeacher مع بعض لحماية المسارات بالتوكين والرتبة
const { protect, isTeacher } = require('../middleware/auth.middleware');
const { validate }   = require('../middleware/validate.middleware');
const {
  enterGradeSchema, updateGradeSchema, bulkGradesSchema,
} = require('./exam.schemas');

// جلب الترتيب والترتيب العام (مفتوح للكل أو محمي حسب رغبتك، بيفضل protect)
router.get('/rankings', protect, getRankings);

// جلب درجات طالب معين
router.get('/student/:studentId', protect, getStudentGrades);

// 🚨 جميع المسارات التالية تخص المدرس فقط ومحمية بالتوكين والرتبة
router.use(protect);
router.use(isTeacher);

// مسارات الامتحانات الورقية (يجب أن تكون قبل المسار الرئيسي '/' لعدم التداخل)
router.get('/paper-exams',       getPaperExams);
router.get('/paper-exam-sheet',  getPaperExamSheet);
router.post('/paper-exam',       createPaperExam);
router.post('/paper-exam-bulk',  bulkPaperGrades);
router.delete('/paper-exam',     deletePaperExam);

// المسار الرئيسي للدرجات الإلكترونية
router.get('/', getExamGrades);

// إدخال وتعديل الدرجات الإلكترونية
router.post('/', validate(enterGradeSchema), enterGrade);
router.post('/bulk', validate(bulkGradesSchema), bulkEnterGrades);
router.put('/:id', validate(updateGradeSchema), updateGrade);

module.exports = router;