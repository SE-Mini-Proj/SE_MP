const pushNotificationService = require('../services/pushNotificationService');

async function registerDevice(req, res, next) {
  try {
    await pushNotificationService.registerDevice({
      userId: req.user.id,
      token: req.body?.deviceToken,
    });
    return res.status(201).json({ status: 'ok' });
  } catch (error) {
    return next(error);
  }
}

async function unregisterDevice(req, res, next) {
  try {
    await pushNotificationService.unregisterDevice({
      userId: req.user.id,
      token: req.body?.deviceToken,
    });
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  registerDevice,
  unregisterDevice,
};
