const mongoose = require('mongoose');
const User     = require('../models/User');
const Group    = require('../models/Group');
require('../models/Passkey'); // ensures the model is registered for the lazy mongoose.model() lookups below
const { generateStudentCode, generateResetCode } = require('../utils/generateCode');
const { paginate }    = require('../utils/paginate');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

const getStudents = asyncHandler(async (req, res) => {
  const { year, group, search, page = 1, limit = 50, active } = req.query;
  const filter = { role: 'student' };
  if (year)   filter.academicYear = year;
  if (group)  filter.group        = group;
  if (active !== undefined) filter.isActive = active === 'true';
  if (search) {
    filter.$or = [
      { name:      { $regex: search.trim(), $options: 'i' } },
      { codePlain: { $regex: search.trim().toUpperCase() } },
      { phone:     { $regex: search.trim() } },
    ];
  }
  const result = await paginate(User, filter, {
    page, limit,
    sort:     { academicYear: 1, name: 1 },
    populate: [{ path: 'group', select: 'name academicYear' }],
  });
  return success(res, result);
});

const getStudent = asyncHandler(async (req, res) => {
  const student = await User
    .findOne({ _id: req.params.id, role: 'student' })
    .populate('group', 'name academicYear days time')
    .lean();
  if (!student) return notFound(res, 'الطالب غير موجود');
  delete student.refreshToken;
  return success(res, { student });
});

const createStudent = asyncHandler(async (req, res) => {
  const { name, academicYear, group, phone, parentPhone } = req.body;
  if (group) {
    const grp = await Group.findById(group).lean();
    if (!grp) return notFound(res, 'المجموعة غير موجودة');
    if (grp.academicYear !== academicYear)
      return error(res, 'المجموعة لا تنتمي لهذه السنة الدراسية', 400);
  }
  const plainCode = await generateStudentCode();
  const student = await User.create({
    name, codePlain: plainCode, role: 'student',
    academicYear, group: group || null,
    phone: phone || null, parentPhone: parentPhone || null,
  });
  await student.populate('group', 'name academicYear');
  return created(res, { student: student.toSafeObject(), plainCode },
    `تم إضافة الطالب بنجاح — كود الدخول: ${plainCode}`);
});

const updateStudent = asyncHandler(async (req, res) => {
  const { name, academicYear, group, phone, parentPhone, isActive } = req.body;
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');
  if (group && academicYear) {
    const grp = await Group.findById(group).lean();
    if (!grp) return notFound(res, 'المجموعة غير موجودة');
    if (grp.academicYear !== academicYear)
      return error(res, 'المجموعة لا تنتمي لهذه السنة الدراسية', 400);
  }
  if (name         !== undefined) student.name         = name;
  if (academicYear !== undefined) student.academicYear = academicYear;
  if (group        !== undefined) student.group        = group || null;
  if (phone        !== undefined) student.phone        = phone || null;
  if (parentPhone  !== undefined) student.parentPhone  = parentPhone || null;
  if (isActive     !== undefined) student.isActive     = isActive;
  await student.save();
  await student.populate('group', 'name academicYear');
  return success(res, { student: student.toSafeObject() }, 'تم تعديل بيانات الطالب بنجاح');
});

// ── DELETE — hard delete + full cascade ──────────────────────────────────────
const deleteStudent = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');

  const sid = student._id;

  // Cascade delete all related data
  const [Attendance, Payment, Grade, Point, Note, WatchLog, ExamSubmission, Passkey] =
    ['Attendance','Payment','Grade','Point','Note','WatchLog','ExamSubmission','Passkey']
      .map(m => { try { return mongoose.model(m); } catch { return null; } });

  await Promise.allSettled([
    Attendance     ? Attendance.deleteMany({ student: sid })     : null,
    Payment        ? Payment.deleteMany({ student: sid })        : null,
    Grade          ? Grade.deleteMany({ student: sid })          : null,
    Point          ? Point.deleteMany({ student: sid })          : null,
    WatchLog       ? WatchLog.deleteMany({ student: sid })       : null,
    ExamSubmission ? ExamSubmission.deleteMany({ student: sid }) : null,
    // Any passkeys (fingerprint/Face ID login) registered by this student
    Passkey        ? Passkey.deleteMany({ user: sid })           : null,
    // For notes: remove from readBy arrays + delete private notes
    Note ? Note.updateMany({}, { $pull: { readBy: sid } })       : null,
    Note ? Note.deleteMany({ type: 'private', student: sid })    : null,
  ]);

  // Hard delete the user
  await User.deleteOne({ _id: sid });

  return success(res, {}, 'تم حذف الطالب وجميع بياناته بنجاح');
});

const toggleStatus = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');
  student.isActive = !student.isActive;
  await student.save();
  return success(res, { isActive: student.isActive },
    student.isActive ? 'تم تفعيل حساب الطالب' : 'تم تعليق حساب الطالب');
});

const resetCode = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');
  const newPlainCode = generateResetCode();
  student.codePlain    = newPlainCode;
  student.refreshToken = null;
  await student.save();
  return success(res, { plainCode: newPlainCode },
    `تم إعادة تعيين كود الطالب — الكود الجديد: ${newPlainCode}`);
});

// ── Reset ALL devices — allows the student to log in from new device(s) ────
// Does not touch the code, refresh token, or any other student data, and
// does not affect any other student or any teacher account.
const resetDevice = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');
  student.devices  = [];
  student.deviceId = null;
  await student.save();

  // Any passkey (fingerprint/Face ID) registered on this student's old
  // devices must stop working too — otherwise an old device could use its
  // passkey to bypass the reset.
  try {
    const Passkey = mongoose.model('Passkey');
    await Passkey.deleteMany({ user: student._id });
  } catch { /* Passkey model not loaded — nothing to clean up */ }

  return success(res, {}, 'تم إعادة تعيين جميع الأجهزة — يمكن للطالب تسجيل الدخول من أجهزة جديدة الآن');
});

// ── List a student's bound devices (max 2) ──────────────────────────────────
const getDevices = asyncHandler(async (req, res) => {
  const student = await User
    .findOne({ _id: req.params.id, role: 'student' })
    .select('+devices +deviceId');
  if (!student) return notFound(res, 'الطالب غير موجود');

  // Same transparent legacy-migration view used at login, so the teacher
  // sees a device even if the student hasn't logged in since this update.
  let devices = Array.isArray(student.devices) ? student.devices : [];
  if (devices.length === 0 && student.deviceId) {
    devices = [{ id: student.deviceId, label: null, addedAt: student.createdAt, lastSeenAt: null }];
  }

  return success(res, { devices });
});

// ── Remove a single bound device — the freed slot can be used by a new one ─
const removeDevice = asyncHandler(async (req, res) => {
  const student = await User
    .findOne({ _id: req.params.id, role: 'student' })
    .select('+devices +deviceId');
  if (!student) return notFound(res, 'الطالب غير موجود');

  const { deviceId: targetId } = req.params;

  let devices = Array.isArray(student.devices) ? student.devices : [];
  if (devices.length === 0 && student.deviceId) {
    devices = [{ id: student.deviceId, label: null, addedAt: student.createdAt, lastSeenAt: null }];
  }

  const remaining = devices.filter(d => d.id !== targetId);
  if (remaining.length === devices.length) {
    return notFound(res, 'الجهاز غير موجود');
  }

  student.devices  = remaining;
  student.deviceId = null; // this write path always fully migrates to `devices`
  await student.save();

  // Any passkey (fingerprint/Face ID) registered specifically on the removed
  // device must stop working too — the other devices' passkeys are untouched.
  try {
    const Passkey = mongoose.model('Passkey');
    await Passkey.deleteMany({ user: student._id, deviceId: targetId });
  } catch { /* Passkey model not loaded — nothing to clean up */ }

  return success(res, { devices: remaining }, 'تم حذف الجهاز بنجاح — يمكن لجهاز جديد الدخول مكانه');
});

const getStudentReport = asyncHandler(async (req, res) => {
  const { buildStudentReport } = require('../services/report.service');
  const student = await User
    .findOne({ _id: req.params.id, role: 'student' })
    .populate('group', 'name academicYear').lean();
  if (!student) return notFound(res, 'الطالب غير موجود');
  const report = await buildStudentReport(student);
  return success(res, { report });
});

const getStudentsByYear = asyncHandler(async (req, res) => {
  const result = await User.aggregate([
    { $match: { role: 'student', isActive: true } },
    { $group: { _id: '$academicYear', count: { $sum: 1 },
        students: { $push: { _id: '$_id', name: '$name', code: '$code' } } } },
    { $sort: { _id: 1 } },
  ]);
  return success(res, { years: result });
});

module.exports = {
  getStudents, getStudent, createStudent, updateStudent,
  deleteStudent, toggleStatus, resetCode, resetDevice, getDevices, removeDevice,
  getStudentReport, getStudentsByYear,
};