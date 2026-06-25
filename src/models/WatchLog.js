// src/models/WatchLog.js — Extended with real tracking fields

const mongoose = require('mongoose');

const watchLogSchema = new mongoose.Schema(
  {
    lesson:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    watchedAt:     { type: Date,    default: Date.now },
    lastUpdatedAt: { type: Date,    default: Date.now },
    // Total cumulative seconds actually watched (updated on heartbeat)
    watchDuration: { type: Number,  default: 0, min: 0 },
    // Percentage of video watched (0-100), updated from frontend
    watchPercentage: { type: Number, default: 0, min: 0, max: 100 },
    // true when watchPercentage >= completionThreshold
    completed: { type: Boolean, default: false },
    // How many times the student played the video
    playCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

watchLogSchema.index({ lesson: 1, student: 1 }, { unique: true });
watchLogSchema.index({ lesson: 1 });
watchLogSchema.index({ student: 1 });

module.exports = mongoose.model('WatchLog', watchLogSchema);