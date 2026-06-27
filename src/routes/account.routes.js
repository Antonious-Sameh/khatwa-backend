// src/routes/account.routes.js
const express = require('express');
const router  = express.Router();
const { getAccount, uploadAvatar: uploadAvatarCtrl, removeAvatar, changeCode, updateInfo, getTeacherInfo } = require('../controllers/account.controller');
const { protect, isTeacher } = require('../middleware/auth.middleware');
const { uploadAvatar }       = require('../config/multer');

// Public — students can fetch teacher branding without auth
router.get('/teacher-info', getTeacherInfo);

// All routes require authentication
router.use(protect);

// GET  /api/account/me
router.get('/me', getAccount);

// POST /api/account/avatar
router.post('/avatar', uploadAvatar.single('avatar'), uploadAvatarCtrl);

// DELETE /api/account/avatar
router.delete('/avatar', removeAvatar);

// PATCH /api/account/change-code
router.patch('/change-code', changeCode);

// PATCH /api/account/update-info
router.patch('/update-info', updateInfo);

module.exports = router;