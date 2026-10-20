function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'realtime-chat-backend',
    version: '1.0.0',
  });
}

module.exports = { getHealth };
