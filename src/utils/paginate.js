// src/utils/paginate.js
// Reusable pagination helper for Mongoose queries.

/**
 * @param {Object} query     - Mongoose Query object (before .exec())
 * @param {Object} reqQuery  - req.query from Express (page, limit)
 * @returns { data, pagination }
 */
const paginate = async (model, filter = {}, options = {}) => {
  const page  = Math.max(1, parseInt(options.page)  || 1);
  const limit = Math.min(100, parseInt(options.limit) || 20);
  const skip  = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model
      .find(filter)
      .sort(options.sort || { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(options.populate || [])
      .lean(),
    model.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
};

module.exports = { paginate };