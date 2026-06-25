// src/models/Lesson.js
// Represents a single online lesson — either a video or a file (PDF).
// Designed to support future features:
//   - Real video URLs (Cloudinary / YouTube / Bunny.net)
//   - Sequential unlocking (requirePreviousLesson)
//   - Watch tracking via WatchLog

const mongoose = require('mongoose');

const ACADEMIC_YEARS = [
  'first-prep', 'second-prep', 'third-prep', 'first-sec', 'second-sec',
];

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type:      String,
      required:  [true, 'عنوان الدرس مطلوب'],
      trim:      true,
      minlength: [2,   'العنوان قصير جداً'],
      maxlength: [200, 'العنوان طويل جداً'],
    },

    academicYear: {
      type:     String,
      enum:     { values: ACADEMIC_YEARS, message: 'السنة الدراسية غير صحيحة' },
      required: [true, 'السنة الدراسية مطلوبة'],
    },

    type: {
      type:     String,
      enum:     { values: ['video', 'file'], message: 'النوع يجب أن يكون video أو file' },
      required: [true, 'نوع الدرس مطلوب'],
    },

    // Display order within the year (1, 2, 3 ...)
    order: {
      type:    Number,
      default: 0,
    },

    // true  → visible to students
    // false → draft, teacher-only
    published: {
      type:    Boolean,
      default: false,
    },

    // ── Video-specific ────────────────────────────────────────────────────────
    // Supports: Cloudinary URL, YouTube URL, Bunny.net URL, or any embed URL.
    // Kept as a plain String so we can switch providers without schema changes.
    videoUrl: {
      type:    String,
      default: null,
      trim:    true,
    },

    duration: {
      type:    String,     // "35:20" — human-readable
      default: null,
    },

    thumbnailUrl: {
      type:    String,
      default: null,
    },

    // ── File-specific ─────────────────────────────────────────────────────────
    fileUrl: {
      type:    String,
      default: null,
      trim:    true,
    },

    fileType: {
      type:    String,     // "pdf", "docx", etc.
      default: null,
    },

    fileSize: {
      type:    String,     // "2.4 MB" — stored as string for display
      default: null,
    },

    // ── Future: sequential unlocking ─────────────────────────────────────────
    // When true: student cannot access this lesson until previousLesson is completed.
    // The enforcement logic lives in the student lesson controller.
    requirePreviousLesson: {
      type:    Boolean,
      default: false,
    },

    previousLesson: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Lesson',
      default: null,
    },

    uploadedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
lessonSchema.index({ academicYear: 1, type: 1, order: 1 });
lessonSchema.index({ academicYear: 1, published: 1 });

module.exports = mongoose.model('Lesson', lessonSchema);