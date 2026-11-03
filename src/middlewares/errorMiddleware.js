/**
 * Standardized error handling middleware
 * Enforces the SAD Section 4.4 error envelope specification:
 * { "code": string, "message": string }
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
}

function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      code: 'FILE_TOO_LARGE',
      message: 'File exceeds the configured upload size limit',
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const errorMessage = err.message || 'An unexpected error occurred';

  if (process.env.NODE_ENV !== 'test' && statusCode >= 500) {
    console.error(`[Error] ${errorCode}:`, err.stack || err);
  }

  res.status(statusCode).json({
    code: errorCode,
    message: errorMessage,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
