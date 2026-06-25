// src/controllers/hero.controller.js

const Hero = require('../models/Hero');
const { uploadHero } = require('../config/multer');
const { success, created, notFound } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/heroes ───────────────────────────────────────────────────────────
const getHeroes = asyncHandler(async (req, res) => {
  const heroes = await Hero.find().sort({ order: 1, createdAt: -1 }).lean();
  return success(res, { heroes, total: heroes.length });
});

// ── GET /api/heroes/:id ───────────────────────────────────────────────────────
const getHero = asyncHandler(async (req, res) => {
  const hero = await Hero.findById(req.params.id).lean();
  if (!hero) return notFound(res, 'البطل غير موجود');
  return success(res, { hero });
});

// ── POST /api/heroes ──────────────────────────────────────────────────────────
const createHero = asyncHandler(async (req, res) => {
  const { name, achievement, graduationYear, order } = req.body;
  const photo = req.file?.path || null;   // Cloudinary URL from multer

  const hero = await Hero.create({ name, achievement, graduationYear, order, photo });
  return created(res, { hero }, 'تم إضافة البطل بنجاح');
});

// ── PUT /api/heroes/:id ───────────────────────────────────────────────────────
const updateHero = asyncHandler(async (req, res) => {
  const hero = await Hero.findById(req.params.id);
  if (!hero) return notFound(res, 'البطل غير موجود');

  const { name, achievement, graduationYear, order } = req.body;
  if (name           !== undefined) hero.name           = name;
  if (achievement    !== undefined) hero.achievement    = achievement;
  if (graduationYear !== undefined) hero.graduationYear = graduationYear;
  if (order          !== undefined) hero.order          = order;
  if (req.file?.path)               hero.photo          = req.file.path;

  await hero.save();
  return success(res, { hero }, 'تم تعديل بيانات البطل بنجاح');
});

// ── DELETE /api/heroes/:id ────────────────────────────────────────────────────
const deleteHero = asyncHandler(async (req, res) => {
  const hero = await Hero.findById(req.params.id);
  if (!hero) return notFound(res, 'البطل غير موجود');

  // TODO: delete photo from Cloudinary if exists
  await hero.deleteOne();
  return success(res, {}, 'تم حذف البطل بنجاح');
});

module.exports = { getHeroes, getHero, createHero, updateHero, deleteHero };