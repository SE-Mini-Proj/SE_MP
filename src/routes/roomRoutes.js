const express = require('express');
const { createRoom, joinRoom,createRoomInvite, } = require('../controllers/roomController');
const moderationController = require('../controllers/moderationController');
const { authenticateJWT } = require('../middlewares/authMiddleware');
const { requireRoomRole, ROLES } = require('../middlewares/rbacMiddleware');

const router = express.Router();

// Core room management routes
router.post('/', authenticateJWT, createRoom);
router.post('/:roomId/join', authenticateJWT, joinRoom);

// Create an invitation for a private room.
// The service verifies that the requester is authorized.
router.post('/:roomId/invites', authenticateJWT, createRoomInvite);

// Moderation & Administrative actions (CHAT-SR-005, CHAT-F-023, TC-Sec-05)
// Restricted by RBAC: owner, admin, moderator roles
router.post(
  '/:roomId/members/:userId/mute',
  authenticateJWT,
  requireRoomRole([ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR]),
  moderationController.muteUser
);

router.post(
  '/:roomId/members/:userId/unmute',
  authenticateJWT,
  requireRoomRole([ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR]),
  moderationController.unmuteUser
);

router.post(
  '/:roomId/members/:userId/ban',
  authenticateJWT,
  requireRoomRole([ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR]),
  moderationController.banUser
);

router.post(
  '/:roomId/members/:userId/unban',
  authenticateJWT,
  requireRoomRole([ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR]),
  moderationController.unbanUser
);

router.delete(
  '/:roomId/members/:userId',
  authenticateJWT,
  requireRoomRole([ROLES.OWNER, ROLES.ADMIN]),
  moderationController.removeMember
);

router.delete(
  '/:roomId/messages/:messageId',
  authenticateJWT,
  requireRoomRole([ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR]),
  moderationController.deleteMessage
);

router.get(
  '/:roomId/audit-logs',
  authenticateJWT,
  requireRoomRole([ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR]),
  moderationController.getAuditLogs
);

module.exports = router;
