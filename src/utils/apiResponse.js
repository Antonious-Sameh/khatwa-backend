// src/utils/apiResponse.js
// Standardizes all API responses across the project.
// Every endpoint returns the same shape → easier for frontend to handle.

const success = (res, data = {}, message = 'تمت العملية بنجاح', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const created = (res, data = {}, message = 'تم الإنشاء بنجاح') => {
  return success(res, data, message, 201);
};

const error = (res, message = 'حدث خطأ', statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const notFound = (res, message = 'لم يتم العثور على البيانات') => {
  return error(res, message, 404);
};

const unauthorized = (res, message = 'غير مصرح لك بهذه العملية') => {
  return error(res, message, 401);
};

const forbidden = (res, message = 'ليس لديك صلاحية للقيام بهذه العملية') => {
  return error(res, message, 403);
};

const validationError = (res, errors) => {
  return error(res, 'بيانات غير صحيحة', 422, errors);
};

module.exports = { success, created, error, notFound, unauthorized, forbidden, validationError };