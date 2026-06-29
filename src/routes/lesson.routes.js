const express = require('express');
const router  = express.Router();
const {
  getLessons, getLesson, createLesson, updateLesson,
  deleteLesson, togglePublish, reorderLessons,
  getStreamInfo, heartbeat, getViewers, markWatched,
  addItem, uploadItemFile, updateItem, deleteItem, reorderItems,
} = require('../controllers/lesson.controller');

const { uploadLessonFile } = require('../config/multer');
const { protect, isTeacher, isStudent } = require('../middleware/auth.middleware');

// Teacher routes (protect applied in app.js)
router.get('/',                  getLessons);
router.patch('/reorder',         isTeacher, reorderLessons); // حركنا دي هنا فوق الـ id: لضمان عدم حدوث تعارض
router.get('/:id',               getLesson);
router.post('/',                 isTeacher, createLesson);
router.put('/:id',               isTeacher, updateLesson);
router.delete('/:id',            isTeacher, deleteLesson);
router.patch('/:id/publish',     isTeacher, togglePublish);
router.get('/:id/viewers',       isTeacher, getViewers);
router.post('/:id/items',               isTeacher, addItem);
router.post('/:id/items/upload',        isTeacher, uploadLessonFile.single('file'), uploadItemFile);
router.patch('/:id/items/reorder',      isTeacher, reorderItems);
router.patch('/:id/items/:itemId',      isTeacher, updateItem);
router.delete('/:id/items/:itemId',     isTeacher, deleteItem);

// Student routes
router.get('/:id/stream',        protect, isStudent, getStreamInfo);
router.post('/:id/heartbeat',    protect, isStudent, heartbeat);
router.post('/:id/watch',        protect, isStudent, markWatched);

module.exports = router;