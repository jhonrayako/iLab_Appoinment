/**
 * Custom HTTP Error class
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

/**
 * Centralized error handler middleware (must be last)
 */
const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[${new Date().toISOString()}] Error ${status}:`, message, err);

  res.status(status).json({
    error: {
      status,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

/**
 * Async route handler wrapper to catch errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  HttpError,
  errorHandler,
  asyncHandler,
};
