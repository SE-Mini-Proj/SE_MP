const { sanitizeDeep } = require('../utils/sanitizer');

/**
 * Express middleware to sanitize incoming request bodies, queries, and params against XSS attacks.
 * Preserves secrets such as passwords and opaque device tokens exactly as submitted.
 */
function xssSanitizerMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    // Passwords and opaque FCM tokens must not be changed by markup sanitization.
    const password = req.body.password;
    const deviceToken = req.body.deviceToken;
    req.body = sanitizeDeep(req.body);
    if (password !== undefined) {
      req.body.password = password;
    }
    if (deviceToken !== undefined) {
      req.body.deviceToken = deviceToken;
    }
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeDeep(req.query);
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeDeep(req.params);
  }

  next();
}

module.exports = { xssSanitizerMiddleware };
