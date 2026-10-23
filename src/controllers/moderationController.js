const ModerationService = require('../services/moderationService');

async function muteUser(req, res, next) {
  try {
    const { roomId, userId } = req.params;
    const { mutedUntil, reason } = req.body || {};

    const result = await ModerationService.muteUser({
      roomId,
      targetUserId: userId,
      actorId: req.user.id,
      mutedUntil,
      reason,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'OPERATION_NOT_ALLOWED') {
      return res.status(403).json({
        code: 'OPERATION_NOT_ALLOWED',
        message: error.message,
      });
    }
    next(error);
  }
}

async function unmuteUser(req, res, next) {
  try {
    const { roomId, userId } = req.params;
    const { reason } = req.body || {};

    const result = await ModerationService.unmuteUser({
      roomId,
      targetUserId: userId,
      actorId: req.user.id,
      reason,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function banUser(req, res, next) {
  try {
    const { roomId, userId } = req.params;
    const { reason } = req.body || {};

    const result = await ModerationService.banUser({
      roomId,
      targetUserId: userId,
      actorId: req.user.id,
      reason,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'OPERATION_NOT_ALLOWED') {
      return res.status(403).json({
        code: 'OPERATION_NOT_ALLOWED',
        message: error.message,
      });
    }
    next(error);
  }
}

async function unbanUser(req, res, next) {
  try {
    const { roomId, userId } = req.params;
    const { reason } = req.body || {};

    const result = await ModerationService.unbanUser({
      roomId,
      targetUserId: userId,
      actorId: req.user.id,
      reason,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function deleteMessage(req, res, next) {
  try {
    const { roomId, messageId } = req.params;
    const { reason } = req.body || {};

    const result = await ModerationService.deleteMessage({
      roomId,
      messageId,
      actorId: req.user.id,
      reason,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function removeMember(req, res, next) {
  try {
    const { roomId, userId } = req.params;
    const { reason } = req.body || {};

    const result = await ModerationService.removeMember({
      roomId,
      targetUserId: userId,
      actorId: req.user.id,
      reason,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'OPERATION_NOT_ALLOWED') {
      return res.status(403).json({
        code: 'OPERATION_NOT_ALLOWED',
        message: error.message,
      });
    }
    next(error);
  }
}

async function getAuditLogs(req, res, next) {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 50;
    const before = req.query.before || null;

    const logs = await ModerationService.getRoomAuditLogs({ roomId, limit, before });
    return res.status(200).json({ logs });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  muteUser,
  unmuteUser,
  banUser,
  unbanUser,
  deleteMessage,
  removeMember,
  getAuditLogs,
};
