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
  resetDevice,
  getDevices,
  removeDevice,
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

// POST /api/students/:id/reset-device — unbind ALL of the student's devices
router.post('/:id/reset-device', resetDevice);

// GET /api/students/:id/devices — list the student's bound devices (max 2)
router.get('/:id/devices', getDevices);

// DELETE /api/students/:id/devices/:deviceId — unbind a single device
router.delete('/:id/devices/:deviceId', removeDevice);

module.exports = router;