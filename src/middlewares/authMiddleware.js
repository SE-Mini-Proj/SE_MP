/**
 * Authentication middleware skeleton
 * Validates Bearer token headers for protected REST endpoints
 */
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authorization header is required',
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      code: 'INVALID_TOKEN_FORMAT',
      message: 'Authorization header must use Bearer schema',
    });
  }

  const token = parts[1];
  // Placeholder validation hook for full JWT implementation in issue #8
  if (!token) {
    return res.status(401).json({
      code: 'INVALID_TOKEN',
      message: 'Token is invalid or expired',
    });
  }

  // Attach mock authenticated user for skeleton development
  req.user = { id: 'user_dummy_id', token };
  next();
}

module.exports = { authenticateJWT };
