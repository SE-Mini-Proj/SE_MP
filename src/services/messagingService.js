/**
 * Messaging Service Skeleton
 * Validates message payloads, persists messages, and prepares them for broadcast.
 */
async function processMessage({ roomId, text, senderId, clientMsgId }) {
  if (!text || text.trim() === '') {
    const error = new Error('Message text cannot be empty');
    error.code = 'EMPTY_MESSAGE';
    error.status = 400;
    throw error;
  }

  const message = {
    messageId: 'msg_' + Date.now(),
    clientMsgId: clientMsgId || null,
    roomId: roomId || null,
    senderId: senderId || 'anonymous',
    text: text.trim(),
    timestamp: new Date().toISOString(),
  };

  return message;
}

module.exports = {
  processMessage,
};
