// src/routes/studentSelf.routes.js
// All routes here require: protect + isStudent (applied in app.js)

const express = require('express');
const router  = express.Router();

const {
  getMe,
  getMyAttendance,
  getMyPayments,
  getMyGrades,
  getMyPoints,
  getMyRank,
  getMyNotes,
  getMyLessons,
  getMyReport,
} = require('../controllers/studentSelf.controller');

// GET /api/student/me
router.get('/me', getMe);

// GET /api/student/attendance?from=&to=&page=&limit=
router.get('/attendance', getMyAttendance);

// GET /api/student/payments
router.get('/payments', getMyPayments);

// GET /api/student/grades
router.get('/grades', getMyGrades);

// GET /api/student/points?page=&limit=
router.get('/points', getMyPoints);

// GET /api/student/rank
router.get('/rank', getMyRank);

// GET /api/student/notes
router.get('/notes', getMyNotes);

// GET /api/student/lessons?type=video|file
router.get('/lessons', getMyLessons);

// GET /api/student/report
router.get('/report', getMyReport);

module.exports = router;