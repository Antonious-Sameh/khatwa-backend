const mongoose = require('mongoose');

const ACADEMIC_YEARS = ['first-prep','second-prep','third-prep','first-sec','second-sec'];

const noteSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: { values: ['general','private'], message: 'النوع يجب أن يكون general أو private' },
      required: [true, 'نوع الملاحظة مطلوب'],
    },
    text: {
      type: String,
      required:  [true, 'نص الملاحظة مطلوب'],
      trim: true,
      minlength: [2,   'الملاحظة قصيرة جداً'],
      maxlength: [1000,'الملاحظة طويلة جداً'],
    },
    academicYear: {
      type: String,
      enum: { values: ACADEMIC_YEARS, message: 'السنة الدراسية غير صحيحة' },
      default: null,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // ── NEW: track which students have read this note ─────────────────────────
    readBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    imageUrl: { type: String, default: null }, // optional image attached to note
  },
  { timestamps: true }
);

noteSchema.index({ type: 1, academicYear: 1 });
noteSchema.index({ type: 1, student: 1 });
noteSchema.index({ createdAt: -1 });

noteSchema.pre('validate', function (next) {
  if (this.type === 'general' && !this.academicYear)
    this.invalidate('academicYear', 'السنة الدراسية مطلوبة للملاحظات العامة');
  if (this.type === 'private' && !this.student)
    this.invalidate('student', 'الطالب مطلوب للملاحظات الخاصة');
  next();
});

module.exports = mongoose.model('Note', noteSchema);