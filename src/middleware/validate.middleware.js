// src/middleware/validate.middleware.js
// Validates req.body using Joi schemas before hitting the controller.
// Returns 422 with field-level errors if validation fails.

const { validationError } = require('../utils/apiResponse');

/**
 * validate(schema) — Express middleware factory.
 * Usage: router.post('/route', validate(mySchema), controller)
 */
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, {
    abortEarly: false,   // return ALL errors, not just the first
    stripUnknown: true,  // remove fields not in schema
    convert: true,       // coerce types where possible
  });

  if (error) {
    const errors = error.details.map((d) => ({
      field:   d.context?.key || 'unknown',
      message: d.message.replace(/['"]/g, ''),
    }));
    return validationError(res, errors);
  }

  next();
};

module.exports = { validate };