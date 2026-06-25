// src/controllers/group.controller.js
// Teacher-facing group management: CRUD + student count per group.

const Group = require('../models/Group');
const User  = require('../models/User');
const { success, created, notFound } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/groups ───────────────────────────────────────────────────────────
// Returns all groups with live student count via aggregation.
const getGroups = asyncHandler(async (req, res) => {
  const { year, active } = req.query;

  const filter = {};
  if (year)   filter.academicYear = year;
  if (active !== undefined) filter.isActive = active === 'true';

  // Aggregate to include student count per group
  const groups = await Group.aggregate([
    { $match: filter },
    {
      $lookup: {
        from:         'users',
        localField:   '_id',
        foreignField: 'group',
        pipeline: [
          { $match: { role: 'student', isActive: true } },
          { $count: 'n' },
        ],
        as: 'studentCountArr',
      },
    },
    {
      $addFields: {
        studentCount: {
          $ifNull: [{ $arrayElemAt: ['$studentCountArr.n', 0] }, 0],
        },
      },
    },
    { $project: { studentCountArr: 0, __v: 0 } },
    { $sort: { academicYear: 1, name: 1 } },
  ]);

  return success(res, { groups, total: groups.length });
});

// ── GET /api/groups/:id ───────────────────────────────────────────────────────
const getGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id).lean();
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  // Attach students in this group
  const students = await User
    .find({ group: group._id, role: 'student', isActive: true })
    .select('name codePlain phone academicYear')
    .sort({ name: 1 })
    .lean();

  return success(res, { group: { ...group, students } });
});

// ── POST /api/groups ──────────────────────────────────────────────────────────
const createGroup = asyncHandler(async (req, res) => {
  const { name, academicYear, schedule, monthlyFee } = req.body;

  const group = await Group.create({
    name,
    academicYear,
    schedule: schedule || [],
    monthlyFee,
  });
  return created(res, { group }, 'تم إنشاء المجموعة بنجاح');
});

// ── PUT /api/groups/:id ───────────────────────────────────────────────────────
const updateGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  const fields = ['name', 'academicYear', 'schedule', 'monthlyFee', 'isActive'];
  fields.forEach((f) => { if (req.body[f] !== undefined) group[f] = req.body[f]; });

  await group.save();
  return success(res, { group }, 'تم تعديل المجموعة بنجاح');
});

// ── DELETE /api/groups/:id ────────────────────────────────────────────────────
const deleteGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  // Pre-delete hook checks for students → throws if any exist
  await group.deleteOne();
  return success(res, {}, 'تم حذف المجموعة بنجاح');
});

// ── GET /api/groups/:id/students ──────────────────────────────────────────────
// Standalone endpoint for fetching students of a specific group.
const getGroupStudents = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id).lean();
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  const students = await User
    .find({ group: req.params.id, role: 'student' })
    .select('name codePlain phone academicYear isActive avatar')
    .sort({ name: 1 })
    .lean();

  return success(res, { group, students, total: students.length });
});

module.exports = {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupStudents,
};