const { verifyToken } = require('../services/authService');

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
      message: 'Authorization header must use Bearer token format',
    });
  }

  try {
    const claims = verifyToken(parts[1]);
    req.user = {
      id: claims.sub,
      email: claims.email,
      username: claims.username,
      role: claims.role || 'member',
      token: parts[1],
    };
    return next();
  } catch {
    return res.status(401).json({
      code: 'INVALID_TOKEN',
      message: 'Token is invalid or expired',
    });
  }
}

module.exports = { authenticateJWT };
