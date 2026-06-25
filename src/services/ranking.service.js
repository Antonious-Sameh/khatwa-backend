// src/services/ranking.service.js
// Reusable rankings calculator.
// Used by: grade.controller (teacher view) + studentSelf.controller (student rank).

const mongoose = require('mongoose');

/**
 * getRankingsForYear
 * Returns ranked students for a given academic year.
 * Only counts grades from published/closed exams (not drafts).
 *
 * @param {string} academicYear  e.g. 'third-prep'
 * @returns {Array} sorted rankings with rank, student, totalScore, totalMax, percentage
 */
const getRankingsForYear = async (academicYear) => {
  const Grade = mongoose.model('Grade');

  const rankings = await Grade.aggregate([
    // Join exam to get academicYear & filter out drafts
    {
      $lookup: {
        from:         'exams',
        localField:   'exam',
        foreignField: '_id',
        as:           'examData',
      },
    },
    { $unwind: '$examData' },
    {
      $match: {
        'examData.academicYear': academicYear,
        'examData.status':       { $ne: 'draft' },
      },
    },

    // Join student info
    {
      $lookup: {
        from:         'users',
        localField:   'student',
        foreignField: '_id',
        as:           'studentData',
        pipeline: [
          { $match: { role: 'student', isActive: true } },
          { $project: { name: 1, codePlain: 1, avatar: 1, group: 1 } },
        ],
      },
    },
    { $unwind: '$studentData' },

    // Group by student — sum scores & max scores
    {
      $group: {
        _id:        '$student',
        student:    { $first: '$studentData' },
        totalScore: { $sum: '$score' },
        totalMax:   { $sum: '$examData.maxScore' },
        examCount:  { $sum: 1 },
      },
    },

    // Sort descending
    { $sort: { totalScore: -1, _id: 1 } },

    // Assign rank (ties share the same rank)
    {
      $setWindowFields: {
        sortBy: { totalScore: -1 },
        output: { rank: { $rank: {} } },
      },
    },

    // Clean up output
    {
      $project: {
        _id:        0,
        rank:       1,
        student:    1,
        totalScore: 1,
        totalMax:   1,
        examCount:  1,
        percentage: {
          $cond: [
            { $gt: ['$totalMax', 0] },
            {
              $round: [
                { $multiply: [{ $divide: ['$totalScore', '$totalMax'] }, 100] },
                1,
              ],
            },
            0,
          ],
        },
      },
    },
  ]);

  // Populate group names
  const User = mongoose.model('User');
  await User.populate(rankings, { path: 'student.group', select: 'name' });

  return rankings;
};

/**
 * getStudentRankInYear
 * Returns a single student's position within their academic year.
 *
 * @param {string|ObjectId} studentId
 * @param {string}          academicYear
 * @returns {{ rank, totalScore, totalMax, outOf, percentage }}
 */
const getStudentRankInYear = async (studentId, academicYear) => {
  const rankings = await getRankingsForYear(academicYear);

  const mine = rankings.find(
    (r) => r.student._id.toString() === studentId.toString()
  );

  return {
    rank:        mine?.rank        || null,
    totalScore:  mine?.totalScore  || 0,
    totalMax:    mine?.totalMax    || 0,
    percentage:  mine?.percentage  || 0,
    outOf:       rankings.length,
    academicYear,
  };
};

module.exports = { getRankingsForYear, getStudentRankInYear };