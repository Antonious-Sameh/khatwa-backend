const express = require('express');
const router  = express.Router();
const {
  getLessons, getLesson, createLesson, updateLesson,
  deleteLesson, togglePublish, reorderLessons,
  getStreamInfo, heartbeat, getViewers, markWatched,
} = require('../controllers/lesson.controller');
const { protect, isTeacher, isStudent } = require('../middleware/auth.middleware');

// Teacher routes (protect applied in app.js)
router.get('/',                  getLessons);
router.get('/:id',               getLesson);
router.post('/',                 isTeacher, createLesson);
router.put('/:id',               isTeacher, updateLesson);
router.delete('/:id',            isTeacher, deleteLesson);
router.patch('/:id/publish',     isTeacher, togglePublish);
router.patch('/reorder',         isTeacher, reorderLessons);
router.get('/:id/viewers',       isTeacher, getViewers);

// Student routes
router.get('/:id/stream',        protect, isStudent, getStreamInfo);
router.post('/:id/heartbeat',    protect, isStudent, heartbeat);
router.post('/:id/watch',        protect, isStudent, markWatched);

module.exports = router;