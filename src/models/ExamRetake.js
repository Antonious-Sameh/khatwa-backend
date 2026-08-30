// src/models/ExamRetake.js
// A "grant" created by a teacher that allows one specific student to submit
// another attempt at an exam they already have a submission for. Consumed
// (status -> 'used') the moment that new attempt is submitted. This never
// touches the student's previous ExamSubmission — it only unlocks a new one.

const mongoose = require('mongoose');

const examRetakeSchema = new mongoose.Schema(
  {
    exam:      { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    student:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status:    { type: String, enum: ['pending', 'used'], default: 'pending' },
    usedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

examRetakeSchema.index({ exam: 1, student: 1, status: 1 });

module.exports = mongoose.model('ExamRetake', examRetakeSchema);