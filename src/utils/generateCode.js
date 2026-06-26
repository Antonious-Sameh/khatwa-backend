// src/utils/generateCode.js
// Generates unique numeric-only student codes (6 digits)
// Easy to type on mobile — no letters, no confusion

const User = require('../models/User');

const generateStudentCode = async () => {
  const MAX_TRIES = 20;
  for (let i = 0; i < MAX_TRIES; i++) {
    // Random 6-digit number: 100000 – 999999
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = await User.exists({ codePlain: code });
    if (!exists) return code;
  }
  // Fallback: 8-digit if 6-digit space is somehow exhausted
  for (let i = 0; i < MAX_TRIES; i++) {
    const code = String(Math.floor(10000000 + Math.random() * 90000000));
    const exists = await User.exists({ codePlain: code });
    if (!exists) return code;
  }
  throw new Error('تعذّر توليد كود فريد — يرجى المحاولة مرة أخرى');
};

// Reset code: 6 random digits (same style — easy on mobile)
const generateResetCode = () =>
  String(Math.floor(100000 + Math.random() * 900000));

module.exports = { generateStudentCode, generateResetCode };