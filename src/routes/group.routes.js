// src/routes/group.routes.js
// Teacher-only routes for group management.

const express = require('express');
const router  = express.Router();

const {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupStudents,
} = require('../controllers/group.controller');

const { validate }                              = require('../middleware/validate.middleware');
const { createGroupSchema, updateGroupSchema }  = require('./student.schemas');

// GET  /api/groups
router.get('/', getGroups);

// GET  /api/groups/:id
router.get('/:id', getGroup);

// GET  /api/groups/:id/students
router.get('/:id/students', getGroupStudents);

// POST /api/groups
router.post('/', validate(createGroupSchema), createGroup);

// PUT  /api/groups/:id
router.put('/:id', validate(updateGroupSchema), updateGroup);

// DELETE /api/groups/:id
router.delete('/:id', deleteGroup);

module.exports = router;