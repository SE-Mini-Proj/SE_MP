const logger = require('../services/loggerService');

/**
 * Structured HTTP request logger.
 * Does not log request bodies, headers, or query parameters.
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    logger.info('http.request', 'HTTP request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip,
    });
  });

  next();
}

module.exports = { requestLogger };
