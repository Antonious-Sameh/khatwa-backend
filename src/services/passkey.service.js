// src/services/passkey.service.js
// Small helpers shared by passkey.controller.js:
//   - Resolves the WebAuthn "Relying Party" id/origin from the existing
//     CLIENT_URL config (no new env vars needed).
//   - Stashes the one-time WebAuthn challenge between the "options" and
//     "verify" steps of a registration/login round trip, the same way the
//     existing auth flow already uses an httpOnly cookie for the refresh
//     token — no new session system, no DB table needed for this.

const { CLIENT_URL, NODE_ENV } = require('../config/env');

// The WebAuthn "Relying Party ID" must be the bare domain (no scheme/port).
const rpID = (() => {
  try {
    return new URL(CLIENT_URL).hostname;
  } catch {
    return 'localhost';
  }
})();

const rpName = 'خطوة بلس';
const expectedOrigin = CLIENT_URL;

const CHALLENGE_COOKIE = 'webauthn_challenge';

// Same cookie flags used for the refreshToken cookie in token.service.js,
// kept in sync so behaviour is identical across environments.
const cookieOptions = () => {
  const isProd = NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge:   5 * 60 * 1000, // challenges are short-lived by design
  };
};

const setChallengeCookie = (res, payload) => {
  res.cookie(CHALLENGE_COOKIE, JSON.stringify(payload), cookieOptions());
};

const readChallengeCookie = (req) => {
  try {
    return JSON.parse(req.cookies?.[CHALLENGE_COOKIE] || 'null');
  } catch {
    return null;
  }
};

const clearChallengeCookie = (res) => {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(CHALLENGE_COOKIE, opts);
};

module.exports = {
  rpID,
  rpName,
  expectedOrigin,
  setChallengeCookie,
  readChallengeCookie,
  clearChallengeCookie,
};
