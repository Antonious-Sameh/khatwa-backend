// src/routes/point.routes.js
const express = require('express');
const router  = express.Router();
const { addPoint, getPoints, getStudentPoints, deletePoint } = require('../controllers/point.controller');
const { isTeacher } = require('../middleware/auth.middleware');
const { validate }  = require('../middleware/validate.middleware');
const { addPointSchema } = require('./misc.schemas');

router.get('/',                   isTeacher, getPoints);
router.get('/student/:studentId', getStudentPoints);
router.post('/',  isTeacher, validate(addPointSchema), addPoint);
router.delete('/:id', isTeacher, deletePoint);

module.exports = router;