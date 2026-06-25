// src/utils/generateCode.js
// Generates unique student codes in format: ST{YEAR}{3-digit-sequence}

const User = require('../models/User');

const generateStudentCode = async () => {
  const year   = new Date().getFullYear();
  const prefix = `ST${year}`;

  // Find the highest existing code for this year using codePlain
  const last = await User
    .findOne({ codePlain: new RegExp(`^${prefix}`) })
    .sort({ codePlain: -1 })
    .select('codePlain')
    .lean();

  if (!last) return `${prefix}001`;

  const lastSeq = parseInt(last.codePlain.replace(prefix, ''), 10);
  const nextSeq = String(lastSeq + 1).padStart(3, '0');
  return `${prefix}${nextSeq}`;
};

const generateResetCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

module.exports = { generateStudentCode, generateResetCode };
