// src/controllers/passkey.controller.js
// Optional WebAuthn ("passkey") login — fingerprint / Face ID / Windows Hello.
//
// Design notes (see the task description this was built against):
//   - This is an ADDITIONAL, optional way to log in. The existing code-based
//     login (auth.controller.js `login`) is completely untouched.
//   - A successful passkey login issues tokens via the exact same
//     generateTokenPair/setRefreshCookie used by normal login — no parallel
//     session system.
//   - Students: a passkey can only be registered for a device that is
//     ALREADY bound in User.devices (the existing 2-device system). This is
//     what guarantees a passkey can never be used to exceed the 2-device cap
//     — it's just a second way to authenticate on a slot that already
//     exists, never a way to create a new one.
//   - Teachers have no device cap, so that check is skipped for them, exactly
//     like the existing login() does.
//   - No biometric data of any kind is ever received or stored — only the
//     WebAuthn public key + credential id, which are useless without the
//     user's physical device.

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const User    = require('../models/User');
const Passkey = require('../models/Passkey');

const { success, error, unauthorized } = require('../utils/apiResponse');
const { asyncHandler }      = require('../middleware/error.middleware');
const { deriveDeviceLabel } = require('../utils/deviceLabel');
const {
  generateTokenPair,
  setRefreshCookie,
} = require('../services/token.service');
const {
  rpID, rpName, expectedOrigin,
  setChallengeCookie, readChallengeCookie, clearChallengeCookie,
} = require('../services/passkey.service');

// ── POST /api/auth/passkey/register/options (protected) ─────────────────────
// Called after the user is already logged in normally, when they tap
// "🔐 تفعيل الدخول بالبصمة".
const registerOptions = asyncHandler(async (req, res) => {
  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
  if (!deviceId) {
    return error(res, 'تعذر تحديد الجهاز', 400);
  }

  const user = await User.findById(req.user.userId).select('+devices');
  if (!user) return unauthorized(res, 'المستخدم غير موجود');

  // Students only: the device must already be one of the (max 2) bound
  // devices — a passkey is never a way to register a new device slot.
  if (user.role === 'student') {
    const devices = Array.isArray(user.devices) ? user.devices : [];
    const isBound = devices.some(d => d.id === deviceId);
    if (!isBound) {
      return error(
        res,
        'يجب تسجيل الدخول بالطريقة العادية من هذا الجهاز أولاً قبل تفعيل الدخول بالبصمة',
        400
      );
    }
  }

  const existing = await Passkey.find({ user: user._id }).select('credentialID').lean();

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID:          user._id.toString(),
    userName:        user.codePlain,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({
      id:   isoBase64URL.toBuffer(p.credentialID),
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey:            'required',   // needed for the usernameless login flow below
      userVerification:       'preferred',
      authenticatorAttachment: 'platform',   // the device's own fingerprint/Face ID/Windows Hello
    },
  });

  setChallengeCookie(res, {
    purpose:   'register',
    challenge: options.challenge,
    userId:    user._id.toString(),
    deviceId,
  });

  return success(res, { options });
});

// ── POST /api/auth/passkey/register/verify (protected) ───────────────────────
const registerVerify = asyncHandler(async (req, res) => {
  const response = req.body?.response;
  const stashed   = readChallengeCookie(req);

  if (!response || typeof response !== 'object') {
    return error(res, 'استجابة غير صالحة', 400);
  }
  if (!stashed || stashed.purpose !== 'register' || stashed.userId !== req.user.userId) {
    clearChallengeCookie(res);
    return error(res, 'انتهت صلاحية الطلب، حاول تفعيل البصمة مرة أخرى', 400);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: stashed.challenge,
      expectedOrigin,
      expectedRPID:      rpID,
    });
  } catch {
    clearChallengeCookie(res);
    return error(res, 'تعذر التحقق من البصمة', 400);
  }
  clearChallengeCookie(res);

  if (!verification.verified || !verification.registrationInfo) {
    return error(res, 'فشل تفعيل الدخول بالبصمة', 400);
  }

  const user = await User.findById(req.user.userId).select('+devices');
  if (!user) return unauthorized(res, 'المستخدم غير موجود');

  // Re-check the device binding at verify time too (the device list could in
  // theory change between the "options" and "verify" round trip).
  if (user.role === 'student') {
    const devices = Array.isArray(user.devices) ? user.devices : [];
    if (!devices.some(d => d.id === stashed.deviceId)) {
      return error(res, 'الجهاز لم يعد مرتبطاً بحسابك', 400);
    }
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

  try {
    await Passkey.create({
      user:         user._id,
      deviceId:     stashed.deviceId,
      credentialID: isoBase64URL.fromBuffer(credentialID),
      publicKey:    isoBase64URL.fromBuffer(credentialPublicKey),
      counter,
      transports:   Array.isArray(response.response?.transports) ? response.response.transports : [],
      deviceLabel:  deriveDeviceLabel(req.headers['user-agent']),
    });
  } catch (err) {
    if (err.code === 11000) {
      return error(res, 'تم تفعيل الدخول بالبصمة لهذا الجهاز بالفعل', 400);
    }
    throw err;
  }

  return success(res, {}, 'تم تفعيل الدخول بالبصمة على هذا الجهاز بنجاح');
});

// ── POST /api/auth/passkey/login/options (public) ────────────────────────────
// "Usernameless" flow: no allowCredentials list, so the browser lets the
// user pick from whichever passkey(s) it has stored for this site.
const loginOptions = asyncHandler(async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
  });

  setChallengeCookie(res, { purpose: 'login', challenge: options.challenge });

  return success(res, { options });
});

// ── POST /api/auth/passkey/login/verify (public) ─────────────────────────────
// On success, logs the user in through the SAME token/cookie system as
// auth.controller.js `login` — no separate session mechanism.
const loginVerify = asyncHandler(async (req, res) => {
  const response = req.body?.response;
  const stashed   = readChallengeCookie(req);

  if (!response?.id) {
    clearChallengeCookie(res);
    return unauthorized(res, 'استجابة غير صالحة');
  }
  if (!stashed || stashed.purpose !== 'login') {
    clearChallengeCookie(res);
    return unauthorized(res, 'انتهت صلاحية الطلب، حاول مرة أخرى');
  }

  const passkey = await Passkey.findOne({ credentialID: response.id });
  if (!passkey) {
    clearChallengeCookie(res);
    return unauthorized(res, 'هذه البصمة غير مسجلة على أي حساب');
  }

  const user = await User.findById(passkey.user).select('+devices');
  if (!user || !user.isActive) {
    clearChallengeCookie(res);
    return unauthorized(res, 'الحساب غير موجود أو غير نشط');
  }

  // Students only: the device this passkey belongs to must STILL be bound.
  // This is what makes "remove device" / "reset all devices" actually revoke
  // the passkey — once the device falls out of User.devices, the passkey
  // stops working here and is cleaned up.
  let boundDevice = null;
  if (user.role === 'student') {
    const devices = Array.isArray(user.devices) ? user.devices : [];
    boundDevice = devices.find(d => d.id === passkey.deviceId) || null;
    if (!boundDevice) {
      await Passkey.deleteOne({ _id: passkey._id });
      clearChallengeCookie(res);
      return unauthorized(res, 'تم إلغاء ربط هذا الجهاز، يرجى تسجيل الدخول بالطريقة العادية');
    }
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stashed.challenge,
      expectedOrigin,
      expectedRPID:      rpID,
      authenticator: {
        credentialID:        isoBase64URL.toBuffer(passkey.credentialID),
        credentialPublicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter:             passkey.counter,
        transports:          passkey.transports,
      },
    });
  } catch {
    clearChallengeCookie(res);
    return unauthorized(res, 'تعذر التحقق من البصمة');
  }
  clearChallengeCookie(res);

  if (!verification.verified) {
    return unauthorized(res, 'تعذر التحقق من البصمة');
  }

  // Anti-replay bookkeeping, as required by the WebAuthn spec.
  passkey.counter    = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  await passkey.save();

  // Same bookkeeping the normal login does for a known device.
  if (boundDevice) {
    boundDevice.lastSeenAt = new Date();
  }

  // ── Exactly the same auth system as normal login ──────────────────────────
  const { accessToken, refreshToken } = generateTokenPair(user);
  await user.setRefreshToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  return success(res, {
    accessToken,
    user: user.toSafeObject(),
  }, 'تم تسجيل الدخول بالبصمة بنجاح');
});

// ── GET /api/auth/passkey/status?deviceId=... (protected) ────────────────────
// Lets the frontend know whether THIS device already has a passkey, so it
// can show "🔐 تفعيل الدخول بالبصمة" vs "مُفعّل بالفعل".
const status = asyncHandler(async (req, res) => {
  const deviceId = typeof req.query?.deviceId === 'string' ? req.query.deviceId : '';
  if (!deviceId) return success(res, { enabled: false });

  const exists = await Passkey.exists({ user: req.user.userId, deviceId });
  return success(res, { enabled: !!exists });
});

// ── DELETE /api/auth/passkey (protected) ──────────────────────────────────────
// Lets a user turn passkey login back off for the current device.
const removeMine = asyncHandler(async (req, res) => {
  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
  if (!deviceId) return error(res, 'تعذر تحديد الجهاز', 400);

  await Passkey.deleteOne({ user: req.user.userId, deviceId });
  return success(res, {}, 'تم إلغاء تفعيل الدخول بالبصمة على هذا الجهاز');
});

module.exports = {
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  status,
  removeMine,
};
