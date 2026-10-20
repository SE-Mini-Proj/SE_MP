const messagingService = require('../../services/messagingService');

function registerMessageHandler(io, socket) {
  socket.on('message:send', async (payload, callback) => {
    try {
      const { roomId, text, clientMsgId } = payload || {};

      if (!text || typeof text !== 'string') {
        const errorPayload = {
          code: 'BAD_REQUEST',
          message: 'Message text must be a non-empty string',
        };
        socket.emit('message:error', errorPayload);
        if (typeof callback === 'function') callback({ error: errorPayload });
        return;
      }

      const message = await messagingService.processMessage({
        roomId,
        text,
        senderId: socket.user?.id || socket.id,
        clientMsgId,
      });

      if (roomId) {
        // Broadcast to all room members (including sender for acknowledgment)
        io.to(roomId).emit('message:receive', message);
      } else {
        // Direct broadcast / echo for skeleton test
        io.emit('message:receive', message);
      }

      if (typeof callback === 'function') {
        callback({ status: 'ok', message });
      }
    } catch (err) {
      const errorPayload = {
        code: err.code || 'MESSAGE_PROCESSING_ERROR',
        message: err.message || 'Failed to process message',
      };
      socket.emit('message:error', errorPayload);
      if (typeof callback === 'function') callback({ error: errorPayload });
    }
  });
}

module.exports = registerMessageHandler;
