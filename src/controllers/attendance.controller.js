// src/controllers/attendance.controller.js

const mongoose   = require('mongoose');
const Attendance = require('../models/Attendance');
const User       = require('../models/User');
const Group      = require('../models/Group');
const { success, created, notFound, error } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── POST /api/attendance/bulk ─────────────────────────────────────────────────
// Submits attendance for an entire group in one request.
// Uses bulkWrite with upsert → safe to re-submit (corrects previous records).
const bulkSubmit = asyncHandler(async (req, res) => {
  const { groupId, date, records } = req.body;
  const teacherId = req.user.userId;

  // Validate group exists
  const group = await Group.findById(groupId).lean();
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  // Build bulkWrite ops — upsert so re-submitting the same day updates records
  const ops = records.map(({ studentId, status, note }) => ({
    updateOne: {
      filter: { student: studentId, date },
      update: {
        $set: {
          student:    studentId,
          group:      groupId,
          date,
          status,
          note:       note || null,
          recordedBy: teacherId,
        },
      },
      upsert: true,
    },
  }));

  const result = await Attendance.bulkWrite(ops, { ordered: false });

  return success(res, {
    date,
    groupId,
    submitted:  records.length,
    inserted:   result.upsertedCount,
    updated:    result.modifiedCount,
  }, `تم حفظ كشف الحضور بتاريخ ${date} بنجاح`);
});

// ── GET /api/attendance?group=&date= ─────────────────────────────────────────
// Returns the attendance sheet for a group on a specific date.
// Also returns students with no record for that day (so teacher sees full list).
const getGroupSheet = asyncHandler(async (req, res) => {
  const { group: groupId, date } = req.query;

  if (!groupId) return error(res, 'معرف المجموعة مطلوب', 400);
  if (!date)    return error(res, 'التاريخ مطلوب', 400);

  const grp = await Group.findById(groupId).lean();
  if (!grp) return notFound(res, 'المجموعة غير موجودة');

  // Get all students in this group
  const students = await User
    .find({ group: groupId, role: 'student', isActive: true })
    .select('_id name codePlain avatar')
    .sort({ name: 1 })
    .lean();

  // Get existing attendance records for this date
  const records = await Attendance
    .find({ group: groupId, date })
    .select('student status note')
    .lean();

  // Map records by studentId for O(1) lookup
  const recordMap = {};
  records.forEach((r) => { recordMap[r.student.toString()] = r; });

  // Merge: every student gets a status (or null if not yet recorded)
  const sheet = students.map((s) => {
    const rec = recordMap[s._id.toString()];
    return {
      student:  s,
      status:   rec?.status || null,
      note:     rec?.note   || null,
      recorded: !!rec,
    };
  });

  const presentCount = sheet.filter((r) => r.status === 'present').length;
  const absentCount  = sheet.filter((r) => r.status === 'absent').length;
  const pendingCount = sheet.filter((r) => !r.recorded).length;

  return success(res, {
    group:  grp,
    date,
    sheet,
    summary: {
      total:   students.length,
      present: presentCount,
      absent:  absentCount,
      pending: pendingCount,
    },
  });
});

// ── GET /api/attendance/student/:id ──────────────────────────────────────────
// Full attendance history for a student with optional date range filter.
const getStudentHistory = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 30 } = req.query;
  const studentId = req.params.id;

  const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const filter = { student: studentId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to)   filter.date.$lte = to;
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Attendance.countDocuments(filter);

  const records = await Attendance
    .find(filter)
    .sort({ date: -1 })
    .skip(skip)
    .limit(Number(limit))
    .select('date status note group')
    .populate('group', 'name')
    .lean();

  // Summary stats (full history, not just current page)
  const stats = await Attendance.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id:     null,
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ['$status', 'absent']  }, 1, 0] } },
      },
    },
  ]);

  const s = stats[0] || { total: 0, present: 0, absent: 0 };

  return success(res, {
    student: { _id: student._id, name: student.name, code: student.codePlain },
    records,
    summary: {
      total:      s.total,
      present:    s.present,
      absent:     s.absent,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    },
    pagination: {
      total,
      page:    Number(page),
      limit:   Number(limit),
      pages:   Math.ceil(total / Number(limit)),
    },
  });
});

// ── GET /api/attendance/stats/:groupId ────────────────────────────────────────
// Aggregate attendance stats for a group over a date range.
const getGroupStats = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { from, to } = req.query;

  const group = await Group.findById(groupId).lean();
  if (!group) return notFound(res, 'المجموعة غير موجودة');

  const matchStage = { group: new mongoose.Types.ObjectId(groupId) };
  if (from || to) {
    matchStage.date = {};
    if (from) matchStage.date.$gte = from;
    if (to)   matchStage.date.$lte = to;
  }

  // Per-student stats
  const perStudent = await Attendance.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id:     '$student',
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ['$status', 'absent']  }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from:         'users',
        localField:   '_id',
        foreignField: '_id',
        as:           'studentData',
        pipeline:     [{ $project: { name: 1, codePlain: 1 } }],
      },
    },
    { $unwind: '$studentData' },
    {
      $project: {
        student:    '$studentData',
        total:      1,
        present:    1,
        absent:     1,
        percentage: {
          $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 0],
        },
      },
    },
    { $sort: { percentage: -1 } },
  ]);

  // Per-date summary (how many sessions were held)
  const sessions = await Attendance.distinct('date', { group: new mongoose.Types.ObjectId(groupId) });

  return success(res, {
    group,
    totalSessions: sessions.length,
    sessions,
    perStudent,
  });
});

// ── PATCH /api/attendance/:id ─────────────────────────────────────────────────
// Update a single attendance record (correct a mistake).
const updateRecord = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const record = await Attendance.findById(req.params.id);
  if (!record) return notFound(res, 'سجل الحضور غير موجود');

  record.status = status;
  if (note !== undefined) record.note = note || null;
  await record.save();

  return success(res, { record }, 'تم تعديل سجل الحضور بنجاح');
});

// ── GET /api/attendance/dates?group= ─────────────────────────────────────────
// Returns all dates that have attendance records for a group.
// Used by the frontend calendar/date picker.
const getGroupDates = asyncHandler(async (req, res) => {
  const { group: groupId } = req.query;
  if (!groupId) return error(res, 'معرف المجموعة مطلوب', 400);

  const dates = await Attendance
    .distinct('date', { group: groupId })
    .then((d) => d.sort().reverse());

  return success(res, { dates, total: dates.length });
});

module.exports = {
  bulkSubmit,
  getGroupSheet,
  getStudentHistory,
  getGroupStats,
  updateRecord,
  getGroupDates,
};