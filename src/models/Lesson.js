// src/models/Lesson.js — Extended: lesson is now a content container (items[])
// Backward-compatible: legacy videoUrl/fileUrl fields still work

const mongoose = require('mongoose');
const ACADEMIC_YEARS = ['first-prep','second-prep','third-prep','first-sec','second-sec'];

// ── Content item sub-schema ───────────────────────────────────────────────────
const contentItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['video','image','pdf','article'],
    required: true,
  },
  order:    { type: Number, default: 0 },
  // video
  videoUrl: { type: String, default: null, trim: true },
  duration: { type: String, default: null },
  // image
  imageUrl:    { type: String, default: null },
  imageCaption:{ type: String, default: null, maxlength: 300 },
  // pdf
  pdfUrl:   { type: String, default: null },
  pdfName:  { type: String, default: null },
  // article
  title:    { type: String, default: null, trim: true, maxlength: 200 },
  body:     { type: String, default: null, maxlength: 10000 },
}, { _id: true, timestamps: true });

const lessonSchema = new mongoose.Schema({
  title:        { type: String, required: [true,'عنوان الدرس مطلوب'], trim: true, minlength: 2, maxlength: 200 },
  academicYear: { type: String, enum: { values: ACADEMIC_YEARS, message: 'السنة الدراسية غير صحيحة' }, required: true },
  description:  { type: String, default: null, trim: true, maxlength: 500 },
  order:        { type: Number, default: 0 },
  published:    { type: Boolean, default: false },

  // ── Content items (new multi-content system) ──────────────────────────────
  items: [contentItemSchema],

  // ── Legacy fields (kept for backward compat + video tracking) ────────────
  type:     { type: String, enum: ['video','file'], default: 'video' },
  videoUrl: { type: String, default: null, trim: true },
  duration: { type: String, default: null },
  thumbnailUrl: { type: String, default: null },
  fileUrl:  { type: String, default: null },
  fileType: { type: String, default: null },
  fileSize: { type: String, default: null },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

lessonSchema.index({ academicYear: 1, order: 1 });
lessonSchema.index({ academicYear: 1, published: 1 });

module.exports = mongoose.model('Lesson', lessonSchema);