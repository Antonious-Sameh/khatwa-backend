// src/models/Grade.js
// One grade document per student per exam — enforced by unique compound index.

const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema(
  {
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'الطالب مطلوب'],
    },

    exam: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Exam',
      required: [true, 'الامتحان مطلوب'],
    },

    score: {
      type:     Number,
      required: [true, 'الدرجة مطلوبة'],
      min:      [0,    'الدرجة لا يمكن أن تكون سالبة'],
    },

    note: {
      type:      String,
      trim:      true,
      default:   null,
      maxlength: [200, 'الملاحظة طويلة جداً'],
    },

    correctedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// One grade per student per exam
gradeSchema.index({ student: 1, exam: 1 }, { unique: true });
// Fast lookup: all grades for an exam (for grade sheet)
gradeSchema.index({ exam: 1 });
// Fast lookup: all grades for a student
gradeSchema.index({ student: 1 });

// ── Validate score ≤ exam maxScore ────────────────────────────────────────────
gradeSchema.pre('save', async function (next) {
  if (!this.isModified('score')) return next();
  const Exam = mongoose.model('Exam');
  const exam = await Exam.findById(this.exam).select('maxScore').lean();
  if (exam && this.score > exam.maxScore) {
    const err = new Error(`الدرجة (${this.score}) أكبر من الدرجة الكاملة (${exam.maxScore})`);
    err.statusCode = 400;
    return next(err);
  }
  next();
});

module.exports = mongoose.model('Grade', gradeSchema);