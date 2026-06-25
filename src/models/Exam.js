// src/models/Exam.js — Extended with MCQ/TrueFalse questions + answer sheet upload

const mongoose = require('mongoose');

const ACADEMIC_YEARS = ['first-prep','second-prep','third-prep','first-sec','second-sec'];

// ── Question sub-schema ───────────────────────────────────────────────────────
const questionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  type: { type: String, enum: ['mcq', 'truefalse'], required: true },
  // MCQ: ['option A', 'option B', 'option C', 'option D']  (min 2, max 4)
  // TrueFalse: ['صح', 'خطأ']  (auto-set)
  options: [{ type: String, trim: true }],
  // Index into options[] that is correct (0-based)
  correctAnswer: { type: Number, required: true, min: 0 },
  // Points for this question (default 1)
  points: { type: Number, default: 1, min: 0 },
}, { _id: true });

// ── Main Exam schema ──────────────────────────────────────────────────────────
const examSchema = new mongoose.Schema(
  {
    title:       { type: String, required: [true,'عنوان الامتحان مطلوب'], trim: true, minlength: 2, maxlength: 150 },
    academicYear:{ type: String, enum: { values: ACADEMIC_YEARS, message: 'السنة الدراسية غير صحيحة' }, required: true },
    description: { type: String, trim: true, default: null, maxlength: 500 },
    examDate:    { type: Date,   default: null },
    duration:    { type: Number, default: null, min: 1 }, // minutes

    // auto-calculated from questions[].points when questions are set
    maxScore: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ['draft','published','closed'],
      default: 'draft',
    },

    questions: [questionSchema],

    // Answer sheet: teacher uploads PDF or image
    answerSheetUrl:  { type: String, default: null },
    answerSheetType: { type: String, enum: ['image','pdf',null], default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

examSchema.index({ academicYear: 1, status: 1 });
examSchema.index({ examDate: -1 });

// Auto-calculate maxScore from questions
examSchema.pre('save', function(next) {
  if (this.isModified('questions') && this.questions.length > 0) {
    this.maxScore = this.questions.reduce((sum, q) => sum + (q.points || 1), 0);
  }
  next();
});

module.exports = mongoose.model('Exam', examSchema);