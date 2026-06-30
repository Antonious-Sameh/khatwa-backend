// src/services/token.service.js
// Handles all JWT operations: sign, verify, refresh pair generation.

const jwt = require('jsonwebtoken');
const {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES,
  JWT_REFRESH_EXPIRES,
} = require('../config/env');

/**
 * Signs an Access Token (short-lived, stored in memory on client).
 */
const signAccessToken = (payload) => {
  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES,
  });
};

/**
 * Signs a Refresh Token (long-lived, stored in httpOnly cookie).
 */
const signRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES,
  });
};

/**
 * Verifies an Access Token.
 * Returns decoded payload or throws.
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_ACCESS_SECRET);
};

/**
 * Verifies a Refresh Token.
 * Returns decoded payload or throws.
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, JWT_REFRESH_SECRET);
};

/**
 * Generates both access + refresh tokens for a user.
 * Returns them as a pair.
 */
const generateTokenPair = (user) => {
  const payload = {
    userId:       user._id,
    role:         user.role,
    // Include academicYear & group in payload for fast middleware checks
    // without hitting the DB on every request.
    academicYear: user.academicYear || null,
    groupId:      user.group        || null,
  };

  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken({ userId: user._id, role: user.role });

  return { accessToken, refreshToken };
};

/**
 * Sets the refresh token as an httpOnly cookie.
 * Keeps it out of JS reach → XSS safe.
 *
 * For cross-origin deployments (frontend on Vercel, backend elsewhere),
 * sameSite MUST be 'none' + secure:true. 'strict' blocks cross-origin cookies entirely.
 */
const setRefreshCookie = (res, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure:   isProd,                    // must be true when sameSite=none
    sameSite: isProd ? 'none' : 'lax',  // none = allow cross-origin; lax = safe for local dev
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
  });
};

/**
 * Clears the refresh token cookie on logout.
 */
const clearRefreshCookie = (res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
  setRefreshCookie,
  clearRefreshCookie,
};