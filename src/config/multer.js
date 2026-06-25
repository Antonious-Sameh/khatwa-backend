// src/config/multer.js
// Multer configuration using cloudinary v2 directly — no multer-storage-cloudinary.
// Uses custom CloudinaryStorageEngine that streams files to Cloudinary in memory.

const multer                               = require('multer');
const { CloudinaryStorageEngine, cloudinary } = require('./cloudinaryStorage');

// ── Avatar / Profile photo ────────────────────────────────────────────────────
const uploadAvatar = multer({
  storage: new CloudinaryStorageEngine({
    params: {
      folder:          'khatwa-plus/avatars',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      resource_type:   'image',
      transformation:  [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('الملف يجب أن يكون صورة (JPG, PNG, WEBP)'));
  },
});

// ── PDF documents ─────────────────────────────────────────────────────────────
const uploadPDF = multer({
  storage: new CloudinaryStorageEngine({
    params: {
      folder:          'khatwa-plus/pdfs',
      allowed_formats: ['pdf'],
      resource_type:   'raw',
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB (Vercel Free limit)
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('الملف يجب أن يكون PDF'));
  },
});

// ── Hero / achievement photos ─────────────────────────────────────────────────
const uploadHero = multer({
  storage: new CloudinaryStorageEngine({
    params: {
      folder:          'khatwa-plus/heroes',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      resource_type:   'image',
      transformation:  [{ width: 600, height: 600, crop: 'fill' }],
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('الملف يجب أن يكون صورة'));
  },
});

// ── Exam answer sheet (PDF or image) ─────────────────────────────────────────
const uploadAnswerSheet = multer({
  storage: new CloudinaryStorageEngine({
    // Dynamic params based on file type
    params: (req, file) => {
      const isPdf = file.mimetype === 'application/pdf';
      return {
        folder:          'khatwa-plus/answer-sheets',
        allowed_formats: isPdf ? ['pdf'] : ['jpg', 'jpeg', 'png', 'webp'],
        resource_type:   isPdf ? 'raw' : 'image',
      };
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('الملف يجب أن يكون PDF أو صورة'));
  },
});

module.exports = { cloudinary, uploadAvatar, uploadPDF, uploadHero, uploadAnswerSheet };