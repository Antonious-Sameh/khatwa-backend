const express = require('express');
const router  = express.Router();
const { getNotes, getStudentNotes, getUnreadCount, markAsRead, markAllRead, createNote, deleteNote, uploadNoteImage, deleteNoteImage } =  
  require('../controllers/note.controller');
const { uploadAvatar } = require('../config/multer');
const { protect, isTeacher, isStudent } = require('../middleware/auth.middleware');
const { validate }  = require('../middleware/validate.middleware');
const { createNoteSchema } = require('./misc.schemas');

// Teacher routes
router.post('/upload-image', isTeacher, uploadAvatar.single('noteImage'), uploadNoteImage);
router.delete('/:id/image', isTeacher, deleteNoteImage);

router.get('/',                    isTeacher, getNotes);
router.get('/student/:studentId',  isTeacher, getStudentNotes);
router.post('/',                   isTeacher, validate(createNoteSchema), createNote);
router.delete('/:id',              isTeacher, deleteNote);

// Student routes (need protect + isStudent — applied before mounting in app.js)
// But since this router doesn't have isStudent globally, we add protect here
router.get('/unread-count', protect, isStudent, getUnreadCount);
router.patch('/mark-all-read', protect, isStudent, markAllRead);
router.patch('/:id/read',    protect, isStudent, markAsRead);

module.exports = router;