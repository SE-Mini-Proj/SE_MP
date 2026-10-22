const { sanitizeDeep } = require('../utils/sanitizer');

/**
 * Express middleware to sanitize incoming request bodies, queries, and params against XSS attacks.
 * Excludes sensitive fields like password (which are hashed, not rendered) to prevent altering user secrets.
 */
function xssSanitizerMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    // Preserve raw passwords since passwords are never rendered to HTML and are hashed with bcrypt
    const password = req.body.password;
    req.body = sanitizeDeep(req.body);
    if (password !== undefined) {
      req.body.password = password;
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
