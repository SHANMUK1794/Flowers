/**
 * Standard API response helper utilities
 */

const sendSuccess = (res, data = {}, message = null, statusCode = 200) => {
  const payload = { success: true, ...data };
  if (message) payload.message = message;
  return res.status(statusCode).json(payload);
};

const sendError = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const payload = { success: false, error: message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

const sendCreated = (res, data = {}, message = 'Resource created successfully') => {
  return sendSuccess(res, data, message, 201);
};

module.exports = {
  sendSuccess,
  sendError,
  sendCreated,
};
