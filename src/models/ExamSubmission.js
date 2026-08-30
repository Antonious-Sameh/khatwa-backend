// src/models/ExamSubmission.js
// Records student's answers + auto-calculated score for an exam

const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId:    { type: mongoose.Schema.Types.ObjectId, required: true },
  chosenAnswer:  { type: Number, default: null },  // index into options[], null = skipped
  isCorrect:     { type: Boolean, default: false },
  pointsEarned:  { type: Number,  default: 0 },
}, { _id: false });

const examSubmissionSchema = new mongoose.Schema(
  {
    exam:    { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    answers: [answerSchema],
    score:      { type: Number, default: 0 },
    maxScore:   { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
    timeTakenSeconds: { type: Number, default: 0 },

    // Attempt number for this (exam, student) pair. Starts at 1 for the
    // normal first attempt; incremented only when a teacher explicitly
    // grants a retake (see ExamRetake). Older attempts are never deleted
    // or modified — they stay in the collection as history.
    attemptNumber: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

// One submission per student per exam PER ATTEMPT — this replaces the old
// { exam, student } unique index so a granted retake can create a second
// document instead of being blocked, while still preventing accidental
// double-submits of the same attempt.
examSubmissionSchema.index({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });
examSubmissionSchema.index({ exam: 1 });
examSubmissionSchema.index({ student: 1 });

module.exports = mongoose.model('ExamSubmission', examSubmissionSchema);