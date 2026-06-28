// src/app.js
// Configures Express: middleware, routes, error handling.

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const { CLIENT_URL, NODE_ENV, COOKIE_SECRET } = require('./config/env');
const { errorHandler } = require('./middleware/error.middleware');
const { protect, isTeacher, isStudent } = require('./middleware/auth.middleware');

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth.routes');
const studentRoutes     = require('./routes/student.routes');
const groupRoutes       = require('./routes/group.routes');
const attendanceRoutes  = require('./routes/attendance.routes');
const paymentRoutes     = require('./routes/payment.routes');
const examRoutes        = require('./routes/exam.routes');
const gradeRoutes       = require('./routes/grade.routes');
const pointRoutes       = require('./routes/point.routes');
const noteRoutes        = require('./routes/note.routes');
const lessonRoutes      = require('./routes/lesson.routes');
const heroRoutes    = require('./routes/hero.routes');
require('./models/HeroAlbum'); // register HeroAlbum model
const studentSelfRoutes = require('./routes/studentSelf.routes');
const accountRoutes     = require('./routes/account.routes');

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:         CLIENT_URL,
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             300,
  message:         { success: false, message: 'طلبات كثيرة جداً، حاول مرة أخرى بعد قليل' },
  standardHeaders: true,
  legacyHeaders:   false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: 'محاولات تسجيل دخول كثيرة، حاول بعد 15 دقيقة' },
});

app.use(globalLimiter);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(COOKIE_SECRET));

// ── Request logging ───────────────────────────────────────────────────────────
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Khatwa Plus API is running ✅',
    env:     NODE_ENV,
    version: '1.0.0',
    time:    new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────

// Auth (rate-limited separately)
app.use('/api/auth', authLimiter, authRoutes);

// Teacher-only routes (protect + isTeacher applied per-router or per-route)
app.use('/api/students',   protect, isTeacher, studentRoutes);
app.use('/api/groups',     protect, isTeacher, groupRoutes);

// الروتس المشتركة والمحمية بـ protect المرتبة والمدعومة بالتحديثات الجديدة
app.use('/api/attendance', protect, attendanceRoutes);  // مختلط: المدرس يكتب، والطالب يقرأ
app.use('/api/payments',   protect, paymentRoutes);     // الـ isTeacher مطبق داخلياً لكل route
app.use('/api/exams',      protect, examRoutes);        // مختلط: امتحانات، تسليم، ونتائج أوراق الإجابة
app.use('/api/grades',     protect, gradeRoutes);       // درجات الطلاب والتقييمات
app.use('/api/points',     protect, pointRoutes);       // نقاط ومكافآت الطلاب
app.use('/api/notes',      protect, noteRoutes);        // ملاحظات وإشعارات المقروء وغير المقروء
app.use('/api/lessons',    protect, lessonRoutes);      // الدروس، الـ Stream والـ Heartbeat الجديد لحساب وقت المشاهدة

// لوحة الشرف (الـ GET للعامة، والتعديل محمي جوة الـ router نفسه)
app.use('/api/heroes',     heroRoutes);

// البروفايل والحساب الشخصي (محروس داخلياً بـ protect جوة ملف الـ routes بتاعه)
app.use('/api/account',    accountRoutes);

// لوحة تحكم الطالب الخاصة (مؤمنة بالكامل للطالب فقط)
app.use('/api/student',    protect, isStudent, studentSelfRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `المسار ${req.originalUrl} غير موجود`,
  });
});

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

module.exports = app;