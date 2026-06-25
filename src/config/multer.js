// src/config/multer.js
// Configures Multer with Cloudinary storage for file uploads.
// Supports: images, PDFs, and (future) videos.

const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = require('./env');

// Initialize Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ── Avatar / Photo uploads ────────────────────────────────────────────────────
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'khatwa-plus/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  },
});

// ── PDF / document uploads ────────────────────────────────────────────────────
const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'khatwa-plus/files',
    allowed_formats: ['pdf'],
    resource_type: 'raw',
  },
});

// ── Hero photos ───────────────────────────────────────────────────────────────
const heroStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'khatwa-plus/heroes',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 600, height: 600, crop: 'fill' }],
  },
});

// ── Future: Video uploads ─────────────────────────────────────────────────────
// const videoStorage = new CloudinaryStorage({
//   cloudinary,
//   params: {
//     folder: 'khatwa-plus/videos',
//     resource_type: 'video',
//     allowed_formats: ['mp4', 'mov', 'avi'],
//   },
// });

// File size limits
const limits = {
  avatar: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  pdf:    { fileSize: 50 * 1024 * 1024 },   // 50 MB
  hero:   { fileSize: 5 * 1024 * 1024 },    // 5 MB
};

const uploadAvatar = multer({ storage: avatarStorage, limits: limits.avatar });
const uploadPDF    = multer({ storage: pdfStorage,    limits: limits.pdf    });
const uploadHero   = multer({ storage: heroStorage,   limits: limits.hero   });

// ── Answer sheet (PDF or image) ───────────────────────────────────────────────
const answerSheetStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const isPdf = file.mimetype === 'application/pdf';
    return {
      folder: 'khatwa-plus/files',
      allowed_formats: isPdf ? ['pdf'] : ['jpg','jpeg','png','webp'],
      resource_type: isPdf ? 'raw' : 'image',
    };
  },
});

const uploadAnswerSheet = multer({ storage: answerSheetStorage, limits: { fileSize: 20 * 1024 * 1024 } });

module.exports = { cloudinary, uploadAvatar, uploadPDF, uploadHero, uploadAnswerSheet };