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
} = require('../controllers/grade.controller');

const { isTeacher }  = require('../middleware/auth.middleware');
const { validate }   = require('../middleware/validate.middleware');
const {
  enterGradeSchema, updateGradeSchema, bulkGradesSchema,
} = require('./exam.schemas');

// GET /api/grades/rankings?year=     ← must be before /:id
router.get('/rankings', getRankings);

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

module.exports = router;