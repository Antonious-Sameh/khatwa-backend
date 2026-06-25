// src/models/Group.js
// Represents a study group (e.g. "مجموعة النخبة" for "first-prep").
// Schedule supports two separate days, each with its own time slot.

const mongoose = require('mongoose');

const ACADEMIC_YEARS = [
  'first-prep',
  'second-prep',
  'third-prep',
  'first-sec',
  'second-sec',
];

const DAYS_OF_WEEK = [
  'السبت',
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
];

// Sub-schema: one scheduled session (day + time)
const sessionSchema = new mongoose.Schema(
  {
    day:  { type: String, enum: DAYS_OF_WEEK, required: true },
    time: { type: String, trim: true, required: true }, // e.g. "4:00م"
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'اسم المجموعة مطلوب'],
      trim:      true,
      minlength: [2, 'اسم المجموعة يجب أن يكون حرفين على الأقل'],
      maxlength: [80, 'اسم المجموعة طويل جداً'],
    },

    academicYear: {
      type:     String,
      enum:     { values: ACADEMIC_YEARS, message: 'السنة الدراسية غير صحيحة' },
      required: [true, 'السنة الدراسية مطلوبة'],
    },

    // New structured schedule: up to 2 sessions per week
    schedule: {
      type:    [sessionSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 2,
        message:   'المجموعة لا يمكن أن تحتوي على أكثر من يومين في الأسبوع',
      },
    },

    // Legacy fields kept for backward-compatibility (optional)
    days: { type: String, trim: true, default: null },
    time: { type: String, trim: true, default: null },

    monthlyFee: {
      type:    Number,
      default: 0,
      min:     [0, 'القسط لا يمكن أن يكون سالباً'],
    },

    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
groupSchema.index({ academicYear: 1, isActive: 1 });

// ── Prevent deleting a group that has students ────────────────────────────────
groupSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  const User  = mongoose.model('User');
  const count = await User.countDocuments({ group: this._id });
  if (count > 0) {
    const err = new Error(`لا يمكن حذف المجموعة لأنها تحتوي على ${count} طالب`);
    err.statusCode = 400;
    return next(err);
  }
  next();
});

module.exports = mongoose.model('Group', groupSchema);