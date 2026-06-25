// src/controllers/student.controller.js
// Teacher-facing student management: CRUD, code reset, toggle status, report.

const mongoose = require('mongoose');
const User     = require('../models/User');
const Group    = require('../models/Group');
const { generateStudentCode, generateResetCode } = require('../utils/generateCode');
const { paginate }    = require('../utils/paginate');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/students ─────────────────────────────────────────────────────────
// Returns all students. Supports filtering by year, group, search, pagination.
const getStudents = asyncHandler(async (req, res) => {
  const { year, group, search, page = 1, limit = 50, active } = req.query;

  const filter = { role: 'student' };

  if (year)   filter.academicYear = year;
  if (group)  filter.group        = group;
  if (active !== undefined) filter.isActive = active === 'true';

  if (search) {
    filter.$or = [
      { name: { $regex: search.trim(), $options: 'i' } },
      { codePlain: { $regex: search.trim().toUpperCase() } },
      { phone: { $regex: search.trim() } },
    ];
  }

  const result = await paginate(User, filter, {
    page,
    limit,
    sort:     { academicYear: 1, name: 1 },
    populate: [{ path: 'group', select: 'name academicYear' }],
  });

  return success(res, result);
});

// ── GET /api/students/:id ─────────────────────────────────────────────────────
const getStudent = asyncHandler(async (req, res) => {
  const student = await User
    .findOne({ _id: req.params.id, role: 'student' })
    .populate('group', 'name academicYear days time')
    .lean();

  if (!student) return notFound(res, 'الطالب غير موجود');

  delete student.refreshToken;
  return success(res, { student });
});

// ── POST /api/students ────────────────────────────────────────────────────────
const createStudent = asyncHandler(async (req, res) => {
  const { name, academicYear, group, phone, parentPhone } = req.body;

  // Validate group belongs to correct year if provided
  if (group) {
    const grp = await Group.findById(group).lean();
    if (!grp) return notFound(res, 'المجموعة غير موجودة');
    if (grp.academicYear !== academicYear) {
      return error(res, 'المجموعة لا تنتمي لهذه السنة الدراسية', 400);
    }
  }

  // Generate unique code
  const plainCode = await generateStudentCode();

  // Create student (pre-save hook hashes the code)
  const student = await User.create({
    name,
    codePlain:    plainCode,
    role:         'student',
    academicYear,
    group:        group || null,
    phone:        phone || null,
    parentPhone:  parentPhone || null,
  });

  await student.populate('group', 'name academicYear');

  return created(res, {
    student:   student.toSafeObject(),
    plainCode,           // Return plain code ONCE so teacher can share it
  }, `تم إضافة الطالب بنجاح — كود الدخول: ${plainCode}`);
});

// ── PUT /api/students/:id ─────────────────────────────────────────────────────
const updateStudent = asyncHandler(async (req, res) => {
  const { name, academicYear, group, phone, parentPhone, isActive } = req.body;

  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');

  // Validate group consistency
  if (group && academicYear) {
    const grp = await Group.findById(group).lean();
    if (!grp) return notFound(res, 'المجموعة غير موجودة');
    if (grp.academicYear !== academicYear) {
      return error(res, 'المجموعة لا تنتمي لهذه السنة الدراسية', 400);
    }
  } else if (group) {
    const grp = await Group.findById(group).lean();
    if (!grp) return notFound(res, 'المجموعة غير موجودة');
    if (grp.academicYear !== student.academicYear) {
      return error(res, 'المجموعة لا تنتمي لسنة الطالب الدراسية', 400);
    }
  }

  // Apply updates
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

// ── DELETE /api/students/:id ──────────────────────────────────────────────────
const deleteStudent = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');

  // Soft delete — keep historical data (attendance, grades, payments)
  student.isActive = false;
  await student.save();

  // For hard delete (uncomment if needed):
  // await student.deleteOne();

  return success(res, {}, 'تم حذف الطالب بنجاح');
});

// ── PATCH /api/students/:id/toggle-status ────────────────────────────────────
const toggleStatus = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');

  student.isActive = !student.isActive;
  await student.save();

  const msg = student.isActive ? 'تم تفعيل حساب الطالب' : 'تم تعليق حساب الطالب';
  return success(res, { isActive: student.isActive }, msg);
});

// ── POST /api/students/:id/reset-code ────────────────────────────────────────
// Generates a new random code, hashes it, saves it, returns plain text once.
const resetCode = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) return notFound(res, 'الطالب غير موجود');

  const newPlainCode = generateResetCode();

  // Setting code marks it as modified → pre-save hook hashes it
  student.codePlain = newPlainCode;
  student.refreshToken = null; // Force re-login with new code
  await student.save();

  return success(res, {
    plainCode: newPlainCode,
  }, `تم إعادة تعيين كود الطالب — الكود الجديد: ${newPlainCode}`);
});

// ── GET /api/students/:id/report ─────────────────────────────────────────────
// Full student report: attendance, payments, grades, points, rank.
// Delegated to report.service to keep controller thin.
const getStudentReport = asyncHandler(async (req, res) => {
  const { buildStudentReport } = require('../services/report.service');

  const student = await User
    .findOne({ _id: req.params.id, role: 'student' })
    .populate('group', 'name academicYear')
    .lean();

  if (!student) return notFound(res, 'الطالب غير موجود');

  const report = await buildStudentReport(student);
  return success(res, { report });
});

// ── GET /api/students/by-year ─────────────────────────────────────────────────
// Returns students grouped by academic year — used by teacher dashboard.
const getStudentsByYear = asyncHandler(async (req, res) => {
  const result = await User.aggregate([
    { $match: { role: 'student', isActive: true } },
    {
      $group: {
        _id:   '$academicYear',
        count: { $sum: 1 },
        students: {
          $push: {
            _id:  '$_id',
            name: '$name',
            code: '$code',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return success(res, { years: result });
});

module.exports = {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  toggleStatus,
  resetCode,
  getStudentReport,
  getStudentsByYear,
};