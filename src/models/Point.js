// src/models/Point.js
// Transaction-based points ledger.
// Balance = sum of all 'add' transactions - sum of all 'remove' transactions.
// Never store a running balance — always calculate from transactions.
// This gives a full audit trail and is easier to correct mistakes.

const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'الطالب مطلوب'],
    },

    type: {
      type:     String,
      enum:     { values: ['add', 'remove'], message: 'النوع يجب أن يكون add أو remove' },
      required: [true, 'نوع المعاملة مطلوب'],
    },

    amount: {
      type:     Number,
      required: [true, 'عدد النقاط مطلوب'],
      min:      [1, 'عدد النقاط يجب أن يكون واحد على الأقل'],
    },

    reason: {
      type:      String,
      trim:      true,
      default:   null, // بقا اختياري وبياخد null لو سيبناه فاضي
      maxlength: [200, 'السبب طويل جداً'],
    },

    createdBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },

    // ── Exam-linked points (optional) ──────────────────────────────────────
    // When a teacher enters points from the "النقاط" column in the grades
    // sheet, the transaction is tagged with the exam it came from so each
    // exam can keep (and later show back) its own independent points value
    // for that student, while still counting normally toward the student's
    // total balance above (same 'add' transaction semantics — nothing
    // special happens in calcBalance/aggregation).
    // - Electronic exam → sourceExam holds the real Exam _id.
    // - Paper exam      → sourceExam stays null; sourceExamTitle identifies
    //   it instead (paper exams aren't separate Exam documents — see Grade
    //   model's examTitle convention, reused here for consistency).
    // Manual/general points added from the Points page leave all three null,
    // exactly as before this feature existed.
    sourceExam: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Exam',
      default: null,
    },
    sourceExamType: {
      type:    String,
      enum:    ['electronic', 'paper', null],
      default: null,
    },
    sourceExamTitle: {
      type:    String,
      trim:    true,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
pointSchema.index({ student: 1, createdAt: -1 });
pointSchema.index({ student: 1, type: 1 });
// Fast lookup + upsert target for "points per exam per student"
pointSchema.index({ sourceExam: 1 });
pointSchema.index({ student: 1, sourceExam: 1 });
pointSchema.index({ student: 1, sourceExamType: 1, sourceExamTitle: 1 });

module.exports = mongoose.model('Point', pointSchema);