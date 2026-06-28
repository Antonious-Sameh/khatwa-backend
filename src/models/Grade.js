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
      default:  null,   // null for paper/manual grades
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
    // For paper exams — store title+maxScore directly (no Exam document required)
    examType:   { type: String, enum: ['electronic','paper'], default: 'electronic' },
    examTitle:  { type: String, default: null, trim: true },   // paper exam name
    maxScore:   { type: Number, default: null, min: 0 },        // paper exam max

    correctedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Unique index ONLY for electronic grades (exam != null)
// Using partialFilterExpression so null exam values are excluded from uniqueness
gradeSchema.index(
  { student: 1, exam: 1 },
  { unique: true, partialFilterExpression: { exam: { $type: 'objectId' } } }
);

// Fast lookup: all grades for an exam (for grade sheet)
gradeSchema.index({ exam: 1 });

// Fast lookup: all grades for a student
gradeSchema.index({ student: 1 });

// Fast lookup: paper exam grades by title
gradeSchema.index({ examType: 1, examTitle: 1 });

// ── Validate score ≤ exam maxScore ────────────────────────────────────────────
gradeSchema.pre('save', async function (next) {
  if (!this.isModified('score')) return next();
  if (!this.exam) return next(); // paper grade — no Exam doc to check
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