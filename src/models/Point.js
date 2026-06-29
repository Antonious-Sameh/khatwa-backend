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
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
pointSchema.index({ student: 1, createdAt: -1 });
pointSchema.index({ student: 1, type: 1 });

module.exports = mongoose.model('Point', pointSchema);