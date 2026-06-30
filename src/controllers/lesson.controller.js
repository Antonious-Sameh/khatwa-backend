// src/controllers/lesson.controller.js

const Lesson   = require('../models/Lesson');
const WatchLog = require('../models/WatchLog');
const User     = require('../models/User');
const { success, created, notFound, error: apiError } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// Completion threshold: student must watch >= this % to count as "completed"
const COMPLETION_THRESHOLD = 80;

// ── Helper: extract YouTube video ID ─────────────────────────────────────────
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([^?&#]+)/,
    /youtube\.com\/watch\?v=([^&#]+)/,
    /youtube\.com\/embed\/([^?&#]+)/,
    /youtube\.com\/shorts\/([^?&#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ── GET /api/lessons?year=&type= ─────────────────────────────────────────────
const getLessons = asyncHandler(async (req, res) => {
  const { year, type, publishedOnly } = req.query;
  const filter = {};
  if (year)               filter.academicYear = year;
  if (type)               filter.type         = type;
  if (publishedOnly === 'true') filter.published = true;

  const lessons = await Lesson.find(filter).sort({ academicYear: 1, order: 1 }).lean();

  // For teacher: attach watch counts
  if (publishedOnly !== 'true') {
    const lessonIds   = lessons.map(l => l._id);
    const watchCounts = await WatchLog.aggregate([
      { $match: { lesson: { $in: lessonIds } } },
      { $group: { _id: '$lesson', count: { $sum: 1 }, completedCount: { $sum: { $cond: ['$completed', 1, 0] } } } },
    ]);
    const cMap = {};
    watchCounts.forEach(w => { cMap[w._id.toString()] = w; });
    lessons.forEach(l => {
      const w = cMap[l._id.toString()] || {};
      l.watchCount     = w.count         || 0;
      l.completedCount = w.completedCount || 0;
    });
  }

  // Strip real video URLs for students (they get embed via /api/lessons/:id/stream)
  // For teacher view (no publishedOnly) keep full URL
  if (publishedOnly === 'true') {
    lessons.forEach(l => { delete l.videoUrl; });
  }

  return success(res, { lessons, total: lessons.length });
});

// ── GET /api/lessons/:id ──────────────────────────────────────────────────────
const getLesson = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id).lean();
  if (!lesson) return notFound(res, 'الدرس غير موجود');
  return success(res, { lesson });
});

// ── POST /api/lessons ─────────────────────────────────────────────────────────
const createLesson = asyncHandler(async (req, res) => {
  const {
    title, academicYear, type, order, published,
    videoUrl, duration, thumbnailUrl,
    fileUrl, fileType, fileSize,
  } = req.body;

  let lessonOrder = order;
  if (!lessonOrder) {
    const last = await Lesson.findOne({ academicYear, type }).sort({ order: -1 }).select('order').lean();
    lessonOrder = (last?.order || 0) + 1;
  }

  const lesson = await Lesson.create({
    title, academicYear, type,
    order:     lessonOrder,
    published: published || false,
    videoUrl:  videoUrl  || null,
    duration:  duration  || null,
    thumbnailUrl: thumbnailUrl || null,
    fileUrl:   fileUrl   || null,
    fileType:  fileType  || null,
    fileSize:  fileSize  || null,
    uploadedBy: req.user.userId,
  });

  return created(res, { lesson }, 'تم إضافة الدرس بنجاح');
});

// ── PUT /api/lessons/:id ──────────────────────────────────────────────────────
const updateLesson = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return notFound(res, 'الدرس غير موجود');
  const fields = ['title','order','published','videoUrl','duration','thumbnailUrl','fileUrl','fileType','fileSize'];
  fields.forEach(f => { if (req.body[f] !== undefined) lesson[f] = req.body[f]; });
  await lesson.save();
  return success(res, { lesson }, 'تم تعديل الدرس بنجاح');
});


// ── DELETE /api/lessons/:id ───────────────────────────────────────────────────
const deleteLesson = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. التحقق من صحة معرف المونجو (ObjectId) لمنع الكراش
  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ success: false, message: 'معرف الدرس غير صحيح' });
  }

  const lesson = await Lesson.findById(id);
  if (!lesson) return notFound(res, 'الدرس غير موجود');

  // 2. تنظيف ملفات Cloudinary المرتبطة بالعناصر (الصور والملفات) تلقائياً
  if (lesson.items?.length) {
    const { cloudinary } = require('../config/multer');
    for (const item of lesson.items) {
      const url = item.imageUrl || item.pdfUrl;
      if (!url) continue;
      try {
        const parts = url.split('/');
        // استخراج الـ public_id الخاص بالملف من الرابط
        const pubId = parts[parts.length - 2] + '/' + parts[parts.length - 1].split('.')[0];
        await cloudinary.uploader.destroy(pubId, { resource_type: item.pdfUrl ? 'raw' : 'image' });
      } catch (e) {
        // حتى لو فشل حذف الملف من السيرفر، مش بنعطل عملية مسح الدرس الأساسية
        console.error('Cloudinary cleanup failed for item:', e.message);
      }
    }
  }

  // 3. حذف سجلات المشاهدة المرتبطة بالدرس
  await WatchLog.deleteMany({ lesson: lesson._id });

  // 4. حذف مستند الدرس نفسه نهائياً
  await Lesson.deleteOne({ _id: lesson._id });

  return success(res, {}, 'تم حذف الدرس بنجاح');
});

// ── PATCH /api/lessons/:id/publish ───────────────────────────────────────────
const togglePublish = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return notFound(res, 'الدرس غير موجود');
  lesson.published = !lesson.published;
  await lesson.save();
  return success(res, { published: lesson.published }, lesson.published ? 'تم نشر الدرس' : 'تم إخفاء الدرس');
});

// ── PATCH /api/lessons/reorder ────────────────────────────────────────────────
const reorderLessons = asyncHandler(async (req, res) => {
  const { lessons } = req.body;
  const ops = lessons.map(({ lessonId, order }) => ({
    updateOne: { filter: { _id: lessonId }, update: { $set: { order } } },
  }));
  await Lesson.bulkWrite(ops);
  return success(res, {}, 'تم تحديث ترتيب الدروس بنجاح');
});

// ── GET /api/lessons/:id/stream (student) ────────────────────────────────────
// Returns embed-safe info without exposing the raw URL directly
const getStreamInfo = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id).lean();
  if (!lesson) return notFound(res, 'الدرس غير موجود');
  if (!lesson.published) return apiError(res, 'هذا الدرس غير متاح', 403);

  const ytId = extractYouTubeId(lesson.videoUrl);

  return success(res, {
    lessonId:    lesson._id,
    title:       lesson.title,
    type:        lesson.type,
    duration:    lesson.duration,
    // For YouTube: return embed URL (not the raw watch URL)
    embedUrl:    ytId ? `https://www.youtube.com/embed/${ytId}?enablejsapi=1&rel=0&modestbranding=1&showinfo=0&iv_load_policy=3&color=white&playsinline=1` : null,
    // For direct video (Cloudinary etc): return signed-style URL
    directUrl:   !ytId && lesson.videoUrl ? lesson.videoUrl : null,
    isYoutube:   !!ytId,
    ytId:        ytId,
    // File URL for non-video lessons
    fileUrl:     lesson.type === 'file' ? lesson.fileUrl : null,
  });
});

// ── POST /api/lessons/:id/heartbeat (student) ────────────────────────────────
// Called periodically while student watches — updates duration + percentage
const heartbeat = asyncHandler(async (req, res) => {
  const { watchDuration = 0, watchPercentage = 0, playCount = 0 } = req.body;
  const studentId = req.user.userId;

  const lesson = await Lesson.findById(req.params.id).lean();
  if (!lesson) return notFound(res, 'الدرس غير موجود');
  if (!lesson.published) return apiError(res, 'الدرس غير متاح', 403);

  const isCompleted = watchPercentage >= COMPLETION_THRESHOLD;

  const log = await WatchLog.findOneAndUpdate(
    { lesson: lesson._id, student: studentId },
    {
      $max: {
        watchDuration,
        watchPercentage,
      },
      $set: {
        lastUpdatedAt: new Date(),
        completed: isCompleted,
      },
      $inc: playCount > 0 ? { playCount } : {},
      $setOnInsert: { watchedAt: new Date() },
    },
    { upsert: true, new: true }
  );

  return success(res, {
    watchDuration:    log.watchDuration,
    watchPercentage:  log.watchPercentage,
    completed:        log.completed,
  });
});

// ── GET /api/lessons/:id/viewers (teacher) ───────────────────────────────────
const getViewers = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id).lean();
  if (!lesson) return notFound(res, 'الدرس غير موجود');

  const students = await User
    .find({ role: 'student', academicYear: lesson.academicYear, isActive: true })
    .select('_id name codePlain')
    .sort({ name: 1 })
    .lean();

  const logs = await WatchLog.find({ lesson: lesson._id }).lean();
  const logMap = new Map();
  logs.forEach(l => logMap.set(l.student.toString(), l));

  const watched    = [];
  const notWatched = [];

  students.forEach(s => {
    const log = logMap.get(s._id.toString());
    if (log) {
      watched.push({
        ...s,
        watchedAt:       log.watchedAt,
        watchDuration:   log.watchDuration,
        watchPercentage: log.watchPercentage,
        completed:       log.completed,
        playCount:       log.playCount,
      });
    } else {
      notWatched.push(s);
    }
  });

  return success(res, {
    lesson: { _id: lesson._id, title: lesson.title },
    summary: {
      total:       students.length,
      watched:     watched.length,
      completed:   watched.filter(w => w.completed).length,
      notWatched:  notWatched.length,
    },
    watched,
    notWatched,
  });
});

// ── POST /api/lessons/:id/watch (student) — legacy simple mark ───────────────
const markWatched = asyncHandler(async (req, res) => {
  const { watchDuration = 0, completed = false } = req.body;
  const studentId = req.user.userId;
  const lesson = await Lesson.findById(req.params.id).lean();
  if (!lesson) return notFound(res, 'الدرس غير موجود');
  if (!lesson.published) return apiError(res, 'الدرس غير متاح', 403);

  const log = await WatchLog.findOneAndUpdate(
    { lesson: lesson._id, student: studentId },
    { $set: { watchedAt: new Date(), completed }, $max: { watchDuration } },
    { upsert: true, new: true }
  );
  return success(res, { log }, 'تم تسجيل المشاهدة');
});


// ── POST /api/lessons/:id/items ───────────────────────────────────────────────
const addItem = asyncHandler(async (req, res) => {
  const lesson = await require('../models/Lesson').findById(req.params.id);
  if (!lesson) return notFound(res, 'الدرس غير موجود');

  const { type, videoUrl, duration, imageUrl, imageCaption, pdfUrl, pdfName, title, body } = req.body;
  if (!type) return apiError(res, 'نوع المحتوى مطلوب', 400);

  const item = {
    type,
    order: lesson.items.length,
    videoUrl:     videoUrl     || null,
    duration:     duration     || null,
    imageUrl:     imageUrl     || null,
    imageCaption: imageCaption || null,
    pdfUrl:       pdfUrl       || null,
    pdfName:      pdfName      || null,
    title:        title        || null,
    body:         body         || null,
  };

  lesson.items.push(item);
  await lesson.save();

  return success(res, { item: lesson.items[lesson.items.length - 1], lesson }, 'تم إضافة المحتوى بنجاح');
});

// ── POST /api/lessons/:id/items/upload ───────────────────────────────────────
// Upload image or PDF, return URL for use in addItem
const uploadItemFile = asyncHandler(async (req, res) => {
  if (!req.file) return apiError(res, 'لم يتم رفع ملف', 400);
  return success(res, {
    url:      req.file.path,
    fileType: req.file.mimetype,
    filename: req.file.originalname,
  }, 'تم رفع الملف');
});

// ── PATCH /api/lessons/:id/items/:itemId ─────────────────────────────────────
const updateItem = asyncHandler(async (req, res) => {
  const lesson = await require('../models/Lesson').findById(req.params.id);
  if (!lesson) return notFound(res, 'الدرس غير موجود');

  const item = lesson.items.id(req.params.itemId);
  if (!item) return notFound(res, 'عنصر المحتوى غير موجود');

  const fields = ['videoUrl','duration','imageUrl','imageCaption','pdfUrl','pdfName','title','body'];
  fields.forEach(f => { if (req.body[f] !== undefined) item[f] = req.body[f]; });

  await lesson.save();
  return success(res, { item }, 'تم تعديل المحتوى بنجاح');
});

// ── DELETE /api/lessons/:id/items/:itemId ─────────────────────────────────────
const deleteItem = asyncHandler(async (req, res) => {
  const lesson = await require('../models/Lesson').findById(req.params.id);
  if (!lesson) return notFound(res, 'الدرس غير موجود');

  const item = lesson.items.id(req.params.itemId);
  if (!item) return notFound(res, 'عنصر المحتوى غير موجود');

  // Delete from Cloudinary if image/pdf
  if (item.imageUrl || item.pdfUrl) {
    const { cloudinary } = require('../config/multer');
    const url = item.imageUrl || item.pdfUrl;
    try {
      const parts = url.split('/');
      const pubId = parts[parts.length-2] + '/' + parts[parts.length-1].split('.')[0];
      await cloudinary.uploader.destroy(pubId, { resource_type: item.pdfUrl ? 'raw' : 'image' });
    } catch {}
  }

  item.deleteOne();
  await lesson.save();
  return success(res, {}, 'تم حذف المحتوى بنجاح');
});

// ── PATCH /api/lessons/:id/items/reorder ─────────────────────────────────────
const reorderItems = asyncHandler(async (req, res) => {
  const { order } = req.body; // array of { itemId, order }
  const lesson = await require('../models/Lesson').findById(req.params.id);
  if (!lesson) return notFound(res, 'الدرس غير موجود');

  order.forEach(({ itemId, order: o }) => {
    const item = lesson.items.id(itemId);
    if (item) item.order = o;
  });

  lesson.items.sort((a, b) => a.order - b.order);
  await lesson.save();
  return success(res, { items: lesson.items }, 'تم تعديل الترتيب');
});

module.exports = {
  getLessons, getLesson, createLesson, updateLesson,
  deleteLesson, togglePublish, reorderLessons,
  getStreamInfo, heartbeat, getViewers, markWatched,
  addItem,
  uploadItemFile,
  updateItem,
  deleteItem,
  reorderItems,
};