// src/routes/point.routes.js
const express = require('express');
const router  = express.Router();
const { addPoint, getPoints, getStudentPoints, deletePoint, getExamPoints, setExamPoint } = require('../controllers/point.controller');
const { isTeacher } = require('../middleware/auth.middleware');
const { validate }  = require('../middleware/validate.middleware');
const { addPointSchema, setExamPointSchema } = require('./misc.schemas');

router.get('/',                   isTeacher, getPoints);
router.get('/by-exam',            isTeacher, getExamPoints); // عمود "النقاط" في صفحة الدرجات — قراءة نقاط امتحان معيّن
router.put('/by-exam', isTeacher, validate(setExamPointSchema), setExamPoint); // عمود "النقاط" — حفظ/تعديل نقاط طالب في امتحان معيّن
router.get('/student/:studentId', getStudentPoints);
router.post('/',  isTeacher, validate(addPointSchema), addPoint);
router.delete('/:id', isTeacher, deletePoint);

module.exports = router;