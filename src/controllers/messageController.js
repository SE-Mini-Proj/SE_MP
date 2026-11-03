const messageHistoryService = require('../services/messageHistoryService');

async function getRoomMessageHistory(req, res, next) {
  try {
    const result = await messageHistoryService.getRoomMessageHistory({
      roomId: req.params.roomId,
      userId: req.user.id,
      limit: req.query.limit,
      before: req.query.before,
    });

    return res.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getRoomMessageHistory,
};
