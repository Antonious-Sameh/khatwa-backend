// src/models/Hero.js
// "أبطال مروا من هنا" — hall of fame for outstanding graduates.

const mongoose = require('mongoose');

const heroSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'اسم البطل مطلوب'],
      trim:      true,
      minlength: [2,   'الاسم قصير جداً'],
      maxlength: [100, 'الاسم طويل جداً'],
    },

    achievement: {
      type:      String,
      required:  [true, 'الإنجاز مطلوب'],
      trim:      true,
      maxlength: [500, 'الإنجاز طويل جداً'],
    },

    graduationYear: {
      type:    String,
      trim:    true,
      default: null,   // e.g. "2024"
    },

    photo: {
      type:    String,   // Cloudinary URL
      default: null,
    },

    // Display order (lower = shown first)
    order: {
      type:    Number,
      default: 0,
    },
  },
  { timestamps: true }
);

heroSchema.index({ order: 1 });

module.exports = mongoose.model('Hero', heroSchema);