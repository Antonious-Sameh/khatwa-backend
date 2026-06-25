const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  url:     { type: String, required: true },
  caption: { type: String, default: null, maxlength: 200 },
  order:   { type: Number, default: 0 },
}, { timestamps: true });

const heroAlbumSchema = new mongoose.Schema({
  title:       { type: String, required: [true,'اسم الألبوم مطلوب'], trim: true, maxlength: 150 },
  description: { type: String, default: null, trim: true, maxlength: 500 },
  coverUrl:    { type: String, default: null },
  order:       { type: Number, default: 0 },
  photos:      [photoSchema],
}, { timestamps: true });

heroAlbumSchema.index({ order: 1, createdAt: -1 });

module.exports = mongoose.model('HeroAlbum', heroAlbumSchema);