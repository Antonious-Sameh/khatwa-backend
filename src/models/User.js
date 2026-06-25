// src/models/User.js
// Single collection for both teacher and student.
// Discriminated by the `role` field.
//
// Auth design:
//   - codeHash: bcrypt hash of the plain code (for secure login comparison)
//   - codeLookup: plain code stored for fast DB lookup (we query by this, then verify hash)
//   This avoids scanning ALL users on every login request.

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const ACADEMIC_YEARS = [
  'first-prep', 'second-prep', 'third-prep', 'first-sec', 'second-sec',
];

const userSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'الاسم مطلوب'],
      trim:      true,
      minlength: [2,   'الاسم يجب أن يكون حرفين على الأقل'],
      maxlength: [100, 'الاسم طويل جداً'],
    },

    // Stores the plain code in UPPERCASE for fast lookup.
    // NEVER used for password comparison — only for finding the user.
    codePlain: {
      type:     String,
      required: [true, 'كود الدخول مطلوب'],
      unique:   true,
      trim:     true,
      uppercase: true,   // safe here — this is the plain index field
    },

    // Stores the bcrypt hash of the code.
    // NEVER uppercased — bcrypt hashes must stay as-is.
    codeHash: {
      type:   String,
      select: false,  // not returned in queries by default
    },

    role: {
      type:     String,
      enum:     ['teacher', 'student'],
      required: [true, 'نوع المستخدم مطلوب'],
    },

    phone: {
      type:    String,
      trim:    true,
      default: null,
    },

    avatar: {
      type:    String,
      default: null,
    },

    isActive: {
      type:    Boolean,
      default: true,
    },

    // ── Student-only ──────────────────────────────────────────────────────────
    academicYear: {
      type:    String,
      enum:    ACADEMIC_YEARS,
      default: null,
    },

    group: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Group',
      default: null,
    },

    parentPhone: {
      type:    String,
      trim:    true,
      default: null,
    },

    // ── Teacher-only ──────────────────────────────────────────────────────────
    subjects: {
      type:    [String],
      default: [],
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
    refreshToken: {
      type:    String,
      default: null,
      select:  false,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ role: 1, academicYear: 1 });
userSchema.index({ group: 1 });
// codePlain already has unique: true → automatic index

// ── Virtual: academic year label ──────────────────────────────────────────────
const YEAR_LABELS = {
  'first-prep':  'الصف الأول الإعدادي',
  'second-prep': 'الصف الثاني الإعدادي',
  'third-prep':  'الصف الثالث الإعدادي',
  'first-sec':   'الصف الأول الثانوي',
  'second-sec':  'الصف الثاني الثانوي',
};

userSchema.virtual('academicYearLabel').get(function () {
  return YEAR_LABELS[this.academicYear] || null;
});

// ── Pre-save: hash the code into codeHash ─────────────────────────────────────
// codePlain is set by the caller (plain text).
// We derive codeHash from it automatically.
userSchema.pre('save', async function (next) {
  // Only re-hash if the plain code changed
  if (!this.isModified('codePlain')) return next();

  const salt    = await bcrypt.genSalt(10);
  this.codeHash = await bcrypt.hash(this.codePlain.toUpperCase(), salt);
  next();
});

// ── Instance method: compare entered code with stored hash ────────────────────
userSchema.methods.compareCode = async function (enteredCode) {
  if (!this.codeHash) return false;
  return bcrypt.compare(enteredCode.trim().toUpperCase(), this.codeHash);
};

// ── Instance method: hash & store refresh token ───────────────────────────────
userSchema.methods.setRefreshToken = async function (token) {
  const salt       = await bcrypt.genSalt(10);
  this.refreshToken = await bcrypt.hash(token, salt);
};

userSchema.methods.compareRefreshToken = async function (token) {
  if (!this.refreshToken) return false;
  return bcrypt.compare(token, this.refreshToken);
};

// ── Hide sensitive fields from JSON output ────────────────────────────────────
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.codeHash;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
