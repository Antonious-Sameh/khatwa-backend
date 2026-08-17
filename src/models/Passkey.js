// src/models/Passkey.js
// Stores WebAuthn ("passkey") credentials so a user can log in with the
// device's fingerprint/Face ID/Windows Hello instead of typing their code.
//
// IMPORTANT: only public-key material is ever stored here — the actual
// biometric (fingerprint/face) never leaves the user's device. See
// https://webauthn.guide for the underlying protocol.
//
// A passkey is always a second factor for a device the user already logs
// into normally:
//   - Students: `deviceId` MUST already exist in User.devices (the existing
//     2-device system) before a passkey can be created for it — this is what
//     stops a passkey from ever being used to add a 3rd device slot. See
//     passkey.controller.js `registerOptions`/`registerVerify`.
//   - Teachers: no device cap exists, so this isn't enforced for them; they
//     may register a passkey per device like today's normal login.

const mongoose = require('mongoose');

const passkeySchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    // The frontend-generated per-browser id (src/lib/deviceId.js) this
    // passkey was created on/is scoped to.
    deviceId: {
      type:     String,
      required: true,
    },

    // WebAuthn credential identifiers — base64url encoded. No biometric data.
    credentialID: {
      type:     String,
      required: true,
      unique:   true,
    },
    publicKey: {
      type:     String,
      required: true,
    },
    counter: {
      type:    Number,
      default: 0,
    },
    transports: {
      type:    [String],
      default: [],
    },

    // Best-effort label for display only (same helper used for the existing
    // device list) — never used for any security decision.
    deviceLabel: {
      type:    String,
      default: null,
    },

    lastUsedAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
);

passkeySchema.index({ user: 1, deviceId: 1 });

module.exports = mongoose.model('Passkey', passkeySchema);
