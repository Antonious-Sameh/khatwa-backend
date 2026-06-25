// src/routes/hero.routes.js
const express = require('express');
const router  = express.Router();

const { getHeroes, getHero, createHero, updateHero, deleteHero } =
  require('../controllers/hero.controller');
const { protect, isTeacher } = require('../middleware/auth.middleware');
const { validate }           = require('../middleware/validate.middleware');
const { uploadHero }         = require('../config/multer');
const { createHeroSchema, updateHeroSchema } = require('./misc.schemas');

// GET /api/heroes        — public (no auth needed for display)
router.get('/',    getHeroes);
router.get('/:id', getHero);

// POST /api/heroes       — teacher + optional photo upload
router.post(
  '/',
  protect, isTeacher,
  uploadHero.single('photo'),
  validate(createHeroSchema),
  createHero
);

// PUT /api/heroes/:id
router.put(
  '/:id',
  protect, isTeacher,
  uploadHero.single('photo'),
  validate(updateHeroSchema),
  updateHero
);

// DELETE /api/heroes/:id
router.delete('/:id', protect, isTeacher, deleteHero);

module.exports = router;