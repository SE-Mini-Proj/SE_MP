/**
 * Structured request logger middleware
 * Logs method, path, IP, timestamp and duration without exposing sensitive payloads.
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    };
    if (process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify(logData));
    }
  });
  next();
}

module.exports = { requestLogger };
