const mongoose = require('mongoose');
const ACADEMIC_YEARS = ['first-prep','second-prep','third-prep','first-sec','second-sec'];

const questionSchema = new mongoose.Schema({
  text:          { type: String, required: true, trim: true },
  imageUrl:      { type: String, default: null }, // NEW: optional question image
  type:          { type: String, enum: ['mcq','truefalse'], required: true },
  options:       [{ type: String, trim: true }],
  correctAnswer: { type: Number, required: true, min: 0 },
  points:        { type: Number, default: 1, min: 0 },
}, { _id: true });

const examSchema = new mongoose.Schema({
  title:        { type: String, required: [true,'عنوان الامتحان مطلوب'], trim: true, minlength: 2, maxlength: 150 },
  academicYear: { type: String, enum: { values: ACADEMIC_YEARS, message: 'السنة الدراسية غير صحيحة' }, required: true },
  description:  { type: String, trim: true, default: null, maxlength: 500 },
  examDate:     { type: Date, default: null },
  duration:     { type: Number, default: null, min: 1 },
  maxScore:     { type: Number, default: 0, min: 0 },
  status:       { type: String, enum: ['draft','published','closed'], default: 'draft' },

  // NEW: exam type
  examType: { type: String, enum: ['electronic','paper'], default: 'electronic' },

  // Electronic exam fields
  questions: [questionSchema],

  // Paper exam fields
  paperFileUrl:  { type: String, default: null }, // PDF or image of the exam paper
  paperFileType: { type: String, enum: ['image','pdf',null], default: null },

  // Answer sheet (both types) — legacy single-file fields kept for backward compatibility
  answerSheetUrl:  { type: String, default: null },
  answerSheetType: { type: String, enum: ['image','pdf',null], default: null },

  // Multiple answer sheets (new) — teacher can attach several PDFs/images
  answerSheets: [{
    url:        { type: String, required: true },
    type:       { type: String, enum: ['image','pdf'], required: true },
    uploadedAt: { type: Date, default: Date.now },
  }],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

examSchema.index({ academicYear: 1, status: 1 });
examSchema.index({ examDate: -1 });
examSchema.index({ examType: 1 });

examSchema.pre('save', function(next) {
  if (this.isModified('questions') && this.questions.length > 0) {
    this.maxScore = this.questions.reduce((sum, q) => sum + (q.points || 1), 0);
  }
  next();
});

module.exports = mongoose.model('Exam', examSchema);