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
      folder:        'khatwa-plus/pdfs',
      resource_type: 'auto',   // auto so Cloudinary serves with CORS headers
      access_mode:   'public',
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
    // Use 'auto' for resource_type — Cloudinary auto-detects PDF as document type
    // and serves it with proper CORS headers (unlike 'raw' which blocks cross-origin reads)
    params: (req, file) => {
      return {
        folder:          'khatwa-plus/answer-sheets',
        resource_type:   'auto',   // auto = Cloudinary picks image/raw/video
        access_mode:     'public', // ensure public CORS-accessible URL
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

// ── Lesson content files (images + PDF) ──────────────────────────────────────
const uploadLessonFile = multer({
  storage: new CloudinaryStorageEngine({
    params: (req, file) => {
      const isPdf = file.mimetype === 'application/pdf';
      return {
        folder:        isPdf ? 'khatwa-plus/lesson-pdfs' : 'khatwa-plus/lesson-images',
        resource_type: 'auto',    // auto handles both PDF and image with CORS headers
        access_mode:   'public',
      };
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','image/jpeg','image/jpg','image/png','image/webp','image/gif'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('الملف يجب أن يكون صورة أو PDF'));
  },
});

module.exports = {
  cloudinary,
  uploadAvatar,
  uploadPDF,
  uploadHero,
  uploadAnswerSheet,
  uploadLessonFile // ضفنا المحرك الجديد هنا
};