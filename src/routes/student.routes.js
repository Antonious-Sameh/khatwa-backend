// src/routes/student.routes.js
// Teacher-only routes for student management.

const express = require('express');
const router  = express.Router();

const {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  toggleStatus,
  resetCode,
  getStudentReport,
  getStudentsByYear,
} = require('../controllers/student.controller');

const { validate }                    = require('../middleware/validate.middleware');
const { createStudentSchema, updateStudentSchema } = require('./student.schemas');

// GET  /api/students/by-year          → grouped by academic year
router.get('/by-year', getStudentsByYear);

// GET  /api/students                   → list with filters
router.get('/', getStudents);

// GET  /api/students/:id               → single student
router.get('/:id', getStudent);

// GET  /api/students/:id/report        → full report
router.get('/:id/report', getStudentReport);

// POST /api/students                   → create student (auto-generates code)
router.post('/', validate(createStudentSchema), createStudent);

// PUT  /api/students/:id               → update student
router.put('/:id', validate(updateStudentSchema), updateStudent);

// DELETE /api/students/:id             → soft delete
router.delete('/:id', deleteStudent);

// PATCH /api/students/:id/toggle-status
router.patch('/:id/toggle-status', toggleStatus);

// POST /api/students/:id/reset-code
router.post('/:id/reset-code', resetCode);

module.exports = router;