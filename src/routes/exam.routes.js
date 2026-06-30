const express = require('express');
const router  = express.Router();
const {
  getExams, getExam, createExam, updateExam, deleteExam,
  changeStatus, uploadAnswerSheet: uploadAnswerSheetCtrl, deleteAnswerSheet,
  submitExam, getResults, getMyResult, uploadPaperFile, deletePaperFile, // ضفناهم هنا
} = require('../controllers/exam.controller');
const { protect, isTeacher, isStudent } = require('../middleware/auth.middleware');
const { uploadAnswerSheet } = require('../config/multer');

// Public-ish: both teacher and student need to see exams (filtered by year)
router.get('/',    getExams);
router.get('/:id', getExam);

// Teacher only
router.post('/',       isTeacher, createExam);
router.put('/:id',     isTeacher, updateExam);
router.delete('/:id',  isTeacher, deleteExam);
router.patch('/:id/status', isTeacher, changeStatus);
router.post('/:id/answer-sheet',   isTeacher, uploadAnswerSheet.array('answerSheets', 10), uploadAnswerSheetCtrl);
router.delete('/:id/answer-sheet/:sheetId', isTeacher, deleteAnswerSheet);
router.delete('/:id/answer-sheet', isTeacher, deleteAnswerSheet);

// مسارات رفع وحذف ملف الامتحان الورقي الجديدة
router.post('/:id/paper-file',   isTeacher, uploadAnswerSheet.single('paperFile'), uploadPaperFile);
router.delete('/:id/paper-file', isTeacher, deletePaperFile);
router.get('/:id/results',         isTeacher, getResults);

// Student only
router.post('/:id/submit',    protect, isStudent, submitExam);
router.get('/:id/my-result',  protect, isStudent, getMyResult);

module.exports = router;