// src/routes/auth.routes.js

const express     = require('express');
const rateLimit   = require('express-rate-limit');
const router       = express.Router();

const { login, refresh, logout, me } = require('../controllers/auth.controller');
const {
  registerOptions: passkeyRegisterOptions,
  registerVerify:  passkeyRegisterVerify,
  loginOptions:    passkeyLoginOptions,
  loginVerify:     passkeyLoginVerify,
  status:          passkeyStatus,
  removeMine:      passkeyRemoveMine,
} = require('../controllers/passkey.controller');
const { protect }                    = require('../middleware/auth.middleware');
const { validate }                   = require('../middleware/validate.middleware');
const { loginSchema }                = require('./auth.schemas');

// ── Login rate limiter ────────────────────────────────────────────────────────
// Keyed by the account "code" being attempted (not by raw IP). This keeps
// brute-force protection per-account intact (repeated wrong attempts against
// the SAME code still get blocked), while letting many different students
// behind a shared IP (school Wi-Fi, mobile-carrier NAT) log in at the same
// time without exhausting one shared IP-wide budget. Falls back to IP only
// when no code is present in the body (e.g. a malformed/non-JSON request).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      25,
  message:  { success: false, message: 'محاولات دخول كثيرة لهذا الحساب، حاول بعد 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: (req) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toLowerCase() : '';
    return code || req.ip;
  },
});

// POST /api/auth/login
router.post('/login', loginLimiter, validate(loginSchema), login);

// POST /api/auth/refresh  (uses httpOnly cookie — no body needed)
router.post('/refresh', refresh);

// POST /api/auth/logout
router.post('/logout', logout);

// GET  /api/auth/me  (protected)
router.get('/me', protect, me);

// ── Passkey / WebAuthn (optional, additive login method) ─────────────────────
// Rate-limited by IP like the other auth endpoints, to keep the surface
// consistent — an assertion/attestation can't meaningfully be "guessed", but
// this still bounds request volume against these endpoints.
const passkeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: 'محاولات كثيرة، حاول بعد قليل' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Registering a passkey happens after a normal, authenticated login.
router.post('/passkey/register/options', passkeyLimiter, protect, passkeyRegisterOptions);
router.post('/passkey/register/verify',  passkeyLimiter, protect, passkeyRegisterVerify);

// Logging in with a passkey happens BEFORE the user is authenticated.
router.post('/passkey/login/options', passkeyLimiter, passkeyLoginOptions);
router.post('/passkey/login/verify',  passkeyLimiter, passkeyLoginVerify);

// Whether the current device already has a passkey / turning it back off.
router.get('/passkey/status',  protect, passkeyStatus);
router.delete('/passkey',      protect, passkeyRemoveMine);

module.exports = router;