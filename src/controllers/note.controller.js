const Note = require('../models/Note');
const User = require('../models/User');
const { success, created, notFound, forbidden } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── GET /api/notes (teacher) ──────────────────────────────────────────────────
const getNotes = asyncHandler(async (req, res) => {
  const { type, year, student: studentId } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (type === 'general' && year)      filter.academicYear = year;
  if (type === 'private' && studentId) filter.student      = studentId;

  const notes = await Note
    .find(filter)
    .populate('student',   'name codePlain')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .lean();

  return success(res, { notes, total: notes.length });
});

// ── GET /api/notes/student/:studentId (teacher view) ─────────────────────────
const getStudentNotes = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const [generalNotes, privateNotes] = await Promise.all([
    Note.find({ type: 'general', academicYear: student.academicYear }).sort({ createdAt: -1 }).lean(),
    Note.find({ type: 'private', student: studentId }).sort({ createdAt: -1 }).lean(),
  ]);

  return success(res, { student: { _id: student._id, name: student.name }, generalNotes, privateNotes });
});

// ── GET /api/notes/unread-count (student) ─────────────────────────────────────
// Returns count of notes NOT read by this student yet
const getUnreadCount = asyncHandler(async (req, res) => {
  const studentId   = req.user.userId;
  const student     = await User.findById(studentId).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  const [generalUnread, privateUnread] = await Promise.all([
    Note.countDocuments({
      type: 'general',
      academicYear: student.academicYear,
      readBy: { $ne: studentId },
    }),
    Note.countDocuments({
      type: 'private',
      student: studentId,
      readBy: { $ne: studentId },
    }),
  ]);

  return success(res, {
    unreadCount: generalUnread + privateUnread,
    generalUnread,
    privateUnread,
  });
});

// ── PATCH /api/notes/:id/read (student) ──────────────────────────────────────
const markAsRead = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;
  const note = await Note.findById(req.params.id);
  if (!note) return notFound(res, 'الملاحظة غير موجودة');

  // Add studentId to readBy if not already there
  await Note.updateOne(
    { _id: note._id },
    { $addToSet: { readBy: studentId } }
  );

  return success(res, {}, 'تم تحديد الملاحظة كمقروءة');
});

// ── PATCH /api/notes/mark-all-read (student) ─────────────────────────────────
const markAllRead = asyncHandler(async (req, res) => {
  const studentId = req.user.userId;
  const student   = await User.findById(studentId).lean();
  if (!student) return notFound(res, 'الطالب غير موجود');

  await Note.updateMany(
    {
      $or: [
        { type: 'general', academicYear: student.academicYear },
        { type: 'private', student: studentId },
      ],
      readBy: { $ne: studentId },
    },
    { $addToSet: { readBy: studentId } }
  );

  return success(res, {}, 'تم تحديد كل الملاحظات كمقروءة');
});

// ── POST /api/notes (teacher) ─────────────────────────────────────────────────
const createNote = asyncHandler(async (req, res) => {
  const { type, text, academicYear, studentId, imageUrl } = req.body;

  if (type === 'private') {
    const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
    if (!student) return notFound(res, 'الطالب غير موجود');
  }

  const note = await Note.create({
    type,
    text,
    academicYear: type === 'general' ? academicYear : null,
    student:      type === 'private' ? studentId    : null,
    createdBy:    req.user.userId,
    readBy:       [],
    imageUrl:     imageUrl || null,
  });

  await note.populate('student', 'name codePlain');
  return created(res, { note }, 'تم إضافة الملاحظة بنجاح');
});

// ── POST /api/notes/upload-image (teacher) ────────────────────────────────────
const uploadNoteImage = asyncHandler(async (req, res) => {
  if (!req.file) return require('../utils/apiResponse').error(res, 'لم يتم رفع صورة', 400);
  return require('../utils/apiResponse').success(res, { imageUrl: req.file.path }, 'تم رفع الصورة');
});

// ── DELETE /api/notes/:id/image (teacher) ─────────────────────────────────────
const deleteNoteImage = asyncHandler(async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return notFound(res, 'الملاحظة غير موجودة');

  if (note.imageUrl) {
    try {
      const { cloudinary } = require('../config/multer');
      const parts  = note.imageUrl.split('/');
      const pubId  = parts[parts.length - 2] + '/' + parts[parts.length - 1].split('.')[0];
      await cloudinary.uploader.destroy(pubId);
    } catch {}
    note.imageUrl = null;
    await note.save();
  }
  return require('../utils/apiResponse').success(res, {}, 'تم حذف الصورة');
});

// ── DELETE /api/notes/:id (teacher) ──────────────────────────────────────────
const deleteNote = asyncHandler(async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return notFound(res, 'الملاحظة غير موجودة');
  await note.deleteOne();
  return success(res, {}, 'تم حذف الملاحظة بنجاح');
});

module.exports = { getNotes, getStudentNotes, getUnreadCount, markAsRead, markAllRead, createNote, deleteNote, uploadNoteImage, deleteNoteImage };