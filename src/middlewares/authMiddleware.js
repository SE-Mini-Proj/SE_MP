const { Buffer } = require('buffer');

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

  // Extract user details from headers or token payload if provided
  let userId = 'user_dummy_id';
  let role = 'member';

  if (req.headers['x-user-id']) {
    userId = req.headers['x-user-id'];
  }
  if (req.headers['x-user-role']) {
    role = req.headers['x-user-role'];
  }

  // Attempt to parse JWT payload if token is formatted as header.payload.signature
  if (token && token.includes('.')) {
    try {
      const partsArr = token.split('.');
      if (partsArr.length === 3) {
        const payload = JSON.parse(Buffer.from(partsArr[1], 'base64').toString('utf8'));
        if (payload.id || payload.userId) {
          userId = payload.id || payload.userId;
        }
        if (payload.role) {
          role = payload.role;
        }
      }
    } catch {
      // Ignore payload decode errors for non-JWT strings
    }
  }

  req.user = { id: userId, role, token };
  next();
}

module.exports = { authenticateJWT };
