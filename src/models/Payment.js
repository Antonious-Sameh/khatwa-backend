// src/models/Payment.js
// One Payment document per student per month.
// Installments are stored as a subdocument array inside the Payment.
// This way we get the full payment history per month in one query.

const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema(
  {
    amount: {
      type:     Number,
      required: [true, 'مبلغ الدفعة مطلوب'],
      min:      [1, 'مبلغ الدفعة يجب أن يكون أكبر من صفر'],
    },
    paidAt: {
      type:    Date,
      default: Date.now,
    },
    note: {
      type:      String,
      trim:      true,
      default:   null,
      maxlength: [200, 'الملاحظة طويلة جداً'],
    },
    recordedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
  },
  { _id: true, timestamps: false }
);

const paymentSchema = new mongoose.Schema(
  {
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'الطالب مطلوب'],
    },

    group: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Group',
      default:  null,
    },

    // e.g. "يونيو 2026" — one document per student per month
    month: {
      type:     String,
      required: [true, 'الشهر مطلوب'],
      trim:     true,
    },

    // Total amount required for this month
    requiredAmount: {
      type:     Number,
      required: [true, 'المبلغ المطلوب مطلوب'],
      min:      [0, 'المبلغ لا يمكن أن يكون سالباً'],
    },

    // Calculated from installments — kept in sync by pre-save hook
    paidAmount: {
      type:    Number,
      default: 0,
      min:     [0, 'المبلغ المدفوع لا يمكن أن يكون سالباً'],
    },

    installments: {
      type:    [installmentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
paymentSchema.index({ student: 1, month: 1 }, { unique: true });
paymentSchema.index({ group: 1, month: 1 });
paymentSchema.index({ student: 1 });

// ── Virtual: remaining amount ─────────────────────────────────────────────────
paymentSchema.virtual('remainingAmount').get(function () {
  return Math.max(0, this.requiredAmount - this.paidAmount);
});

paymentSchema.virtual('isPaid').get(function () {
  return this.paidAmount >= this.requiredAmount;
});

// ── Pre-save: sync paidAmount from installments sum ───────────────────────────
paymentSchema.pre('save', function (next) {
  this.paidAmount = this.installments.reduce((sum, inst) => sum + inst.amount, 0);
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);