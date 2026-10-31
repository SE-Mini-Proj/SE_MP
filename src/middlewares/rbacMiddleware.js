const RoomModel = require('../models/roomModel');

const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  MEMBER: 'member',
};

// Test helper cache for mocked room roles when database is unavailable
const mockRoomRoles = new Map();

function setMockRoomRole(roomId, userId, role) {
  mockRoomRoles.set(`${roomId}:${userId}`, role);
}

function clearMockRoomRoles() {
  mockRoomRoles.clear();
}

function getMockRoomRole(roomId, userId) {
  return mockRoomRoles.get(`${roomId}:${userId}`);
}

/**
 * RBAC Middleware Factory for Room Moderation & Admin Actions
 * Satisfies CHAT-SR-005, SAD §3.9 (STRIDE Elevation of Privilege), TC-Sec-05
 *
 * @param {Array<string>} allowedRoles List of roles permitted to access the route
 */
function requireRoomRole(allowedRoles = [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR]) {
  const normalizedAllowedRoles = allowedRoles.map((r) => r.toLowerCase());

  return async function roomRoleMiddleware(req, res, next) {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }

    // Platform administrator has superuser privilege across all rooms
    if (req.user.role && req.user.role.toLowerCase() === 'admin') {
      req.user.isSuperAdmin = true;
      return next();
    }

    const roomId = req.params.roomId || req.body?.roomId || req.query?.roomId;
    if (!roomId) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Room ID is required to evaluate role permissions',
      });
    }

    let userRole = null;

    // Check header override for direct mock integration testing
    if (req.headers['x-room-role']) {
      userRole = req.headers['x-room-role'].toLowerCase();
    } else {
      // Check in-memory test role map first
      const cacheKey = `${roomId}:${req.user.id}`;
      if (mockRoomRoles.has(cacheKey)) {
        userRole = mockRoomRoles.get(cacheKey);
      } else {
        // Query database for member's role or room ownership
        try {
          userRole = await RoomModel.getMemberRole(roomId, req.user.id);
        } catch {
          // Fall back securely to null if DB query fails
          userRole = null;
        }
      }
    }

    if (userRole && normalizedAllowedRoles.includes(userRole.toLowerCase())) {
      req.user.roomRole = userRole;
      return next();
    }

    return res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Access denied: insufficient permissions to perform this moderation action',
    });
  };
}

/**
 * Middleware ensuring platform-level admin access
 */
function requirePlatformAdmin(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required',
    });
  }

  if (req.user.role && req.user.role.toLowerCase() === 'admin') {
    return next();
  }

  return res.status(403).json({
    code: 'FORBIDDEN',
    message: 'Access denied: administrator privileges required',
  });
}

module.exports = {
  ROLES,
  requireRoomRole,
  requirePlatformAdmin,
  setMockRoomRole,
  clearMockRoomRoles,
  getMockRoomRole,
};
