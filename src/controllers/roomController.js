const roomService = require('../services/roomService');

async function createRoom(req, res, next) {
  try {
    const { name, isPrivate } = req.body;
    if (!name) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Room name is required',
      });
    }

    const room = await roomService.createRoom({ name, isPrivate, ownerId: req.user?.id });
    return res.status(201).json(room);
  } catch (error) {
    next(error);
  }
}

async function joinRoom(req, res, next) {
  try {
    const { roomId } = req.params;
    const { inviteCode } = req.body || {};

    const result = await roomService.joinRoom({ roomId, inviteCode, userId: req.user?.id });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createRoom,
  joinRoom,
};
