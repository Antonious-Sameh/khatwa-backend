// src/routes/auth.routes.js

const express = require('express');
const router  = express.Router();

const { login, refresh, logout, me } = require('../controllers/auth.controller');
const { protect }                    = require('../middleware/auth.middleware');
const { validate }                   = require('../middleware/validate.middleware');
const { loginSchema }                = require('./auth.schemas');

// POST /api/auth/login
router.post('/login', validate(loginSchema), login);

// POST /api/auth/refresh  (uses httpOnly cookie — no body needed)
router.post('/refresh', refresh);

// POST /api/auth/logout
router.post('/logout', logout);

// GET  /api/auth/me  (protected)
router.get('/me', protect, me);

module.exports = router;