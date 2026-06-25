// src/models/Attendance.js
// Records daily attendance for each student.
// One document per student per date — enforced by unique compound index.

const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'الطالب مطلوب'],
    },

    group: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Group',
      required: [true, 'المجموعة مطلوبة'],
    },

    // Store date as a pure date string "YYYY-MM-DD" for easy querying.
    // Avoids timezone issues with Date objects.
    date: {
      type:     String,
      required: [true, 'التاريخ مطلوب'],
      match:    [/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD'],
    },

    status: {
      type:     String,
      enum:     { values: ['present', 'absent'], message: 'الحالة يجب أن تكون present أو absent' },
      required: [true, 'حالة الحضور مطلوبة'],
    },

    // Optional note e.g. "غياب بعذر"
    note: {
      type:    String,
      trim:    true,
      default: null,
      maxlength: [200, 'الملاحظة طويلة جداً'],
    },

    // Which teacher recorded this
    recordedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Prevent duplicate attendance for same student on same day
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

// Fast lookup: all attendance for a group on a date (for kashf)
attendanceSchema.index({ group: 1, date: 1 });

// Fast lookup: all attendance for a student (for student history)
attendanceSchema.index({ student: 1, date: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);