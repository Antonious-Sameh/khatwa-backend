// src/routes/attendance.routes.js
// Mixed access: teacher can write, both teacher & student can read.

const express = require('express');
const router  = express.Router();

const {
  bulkSubmit,
  getGroupSheet,
  getStudentHistory,
  getGroupStats,
  updateRecord,
  getGroupDates,
} = require('../controllers/attendance.controller');

const { isTeacher }  = require('../middleware/auth.middleware');
const { validate }   = require('../middleware/validate.middleware');
const {
  bulkAttendanceSchema,
  updateAttendanceSchema,
} = require('./attendance.schemas');

// ── Teacher-only writes ───────────────────────────────────────────────────────

// POST /api/attendance/bulk
// Submit full group attendance sheet in one request
router.post('/bulk', isTeacher, validate(bulkAttendanceSchema), bulkSubmit);

// PATCH /api/attendance/:id
// Correct a single record
router.patch('/:id', isTeacher, validate(updateAttendanceSchema), updateRecord);

// ── Shared reads (teacher + student) ─────────────────────────────────────────

// GET /api/attendance?group=&date=
// Group sheet for a specific date
router.get('/', getGroupSheet);

// GET /api/attendance/dates?group=
// All dates with records for a group
router.get('/dates', getGroupDates);

// GET /api/attendance/student/:id
// Full history for a student
router.get('/student/:id', getStudentHistory);

// GET /api/attendance/stats/:groupId
// Aggregate stats for a group
router.get('/stats/:groupId', isTeacher, getGroupStats);

module.exports = router;