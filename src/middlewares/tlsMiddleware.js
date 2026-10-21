const config = require('../config');

/**
 * Enforce TLS 1.2+ for all incoming REST connections.
 * Requirement: CHAT-SR-001 (Issue #6)
 * AC-CHAT-SR-001: Plaintext http:// connections are rejected or redirected.
 * Test Case: TC-Sec-01
 */
function enforceTls(req, res, next) {
  const isEnforced = Boolean(config.tls?.enforce);
  const isSecure = Boolean(
    req.secure || (req.headers && req.headers['x-forwarded-proto'] === 'https')
  );

  // Attach Strict-Transport-Security (HSTS) header when secure or when TLS is enforced
  if (isSecure || isEnforced) {
    const maxAge = config.tls?.hstsMaxAge || 31536000;
    res.setHeader('Strict-Transport-Security', `max-age=${maxAge}; includeSubDomains; preload`);
  }

  if (isEnforced && !isSecure) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const host = req.headers.host || 'localhost';
      return res.redirect(301, `https://${host}${req.originalUrl || req.url}`);
    }
    return res.status(403).json({
      code: 'TLS_REQUIRED',
      message: 'TLS 1.2+ is mandatory. Plaintext HTTP connections are not permitted.',
    });
  }

  next();
}

module.exports = {
  enforceTls,
};
