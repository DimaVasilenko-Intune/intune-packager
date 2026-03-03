'use strict';

/**
 * Express error-handling middleware.
 * Returns a consistent JSON error shape for all routes.
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
  if (status >= 500) console.error(err.stack);

  res.status(status).json({
    error:   message,
    status,
    path:    req.path,
    method:  req.method,
  });
};
