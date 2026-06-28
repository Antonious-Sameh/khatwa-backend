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
  getExamRankings, 
} = require('../controllers/grade.controller');

const { isTeacher }  = require('../middleware/auth.middleware');
const { validate }   = require('../middleware/validate.middleware');
const {
  enterGradeSchema, updateGradeSchema, bulkGradesSchema,
} = require('./exam.schemas');

// GET /api/grades/rankings?year=     ← must be before /:id
router.get('/rankings', getRankings);

router.get('/exam-rankings', getExamRankings);

// GET /api/grades/student/:studentId
router.get('/student/:studentId', getStudentGrades);

// GET /api/grades?exam=
router.get('/', isTeacher, getExamGrades);

// POST /api/grades          — single upsert
router.post('/', isTeacher, validate(enterGradeSchema), enterGrade);

// POST /api/grades/bulk     — full sheet upsert
router.post('/bulk', isTeacher, validate(bulkGradesSchema), bulkEnterGrades);

// PUT /api/grades/:id
router.put('/:id', isTeacher, validate(updateGradeSchema), updateGrade);

// Paper exam routes
router.get('/paper-exams',       isTeacher, getPaperExams);
router.get('/paper-exam-sheet',  isTeacher, getPaperExamSheet);
router.post('/paper-exam',       isTeacher, createPaperExam);
router.post('/paper-exam-bulk',  isTeacher, bulkPaperGrades);
router.delete('/paper-exam',     isTeacher, deletePaperExam);

module.exports = router;