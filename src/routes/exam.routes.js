const express = require('express');
const router  = express.Router();
const {
  getExams, getExam, createExam, updateExam, deleteExam,
  changeStatus, uploadAnswerSheet: uploadAnswerSheetCtrl, deleteAnswerSheet,
  submitExam, getResults, getMyResult,
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
router.post('/:id/answer-sheet',   isTeacher, uploadAnswerSheet.single('answerSheet'), uploadAnswerSheetCtrl);
router.delete('/:id/answer-sheet', isTeacher, deleteAnswerSheet);
router.get('/:id/results',         isTeacher, getResults);

// Student only
router.post('/:id/submit',    protect, isStudent, submitExam);
router.get('/:id/my-result',  protect, isStudent, getMyResult);

module.exports = router;