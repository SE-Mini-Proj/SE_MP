const { sanitizeMessage } = require('../utils/sanitizer');

/**
 * Messaging Service
 * Validates, sanitizes (XSS prevention - CHAT-SR-004), persists messages, and prepares them for broadcast.
 */
async function processMessage({ roomId, recipientId, text, senderId, clientMsgId }) {
  if (typeof text !== 'string' || text.trim() === '') {
    const error = new Error('Message text cannot be empty');
    error.code = 'EMPTY_MESSAGE';
    error.status = 400;
    throw error;
  }

  // Server-side sanitization to mitigate XSS (CHAT-SR-004, SAD §3.7)
  const sanitizedText = sanitizeMessage(text);

  const message = {
    messageId: 'msg_' + Date.now(),
    clientMsgId: clientMsgId || null,
    roomId: roomId || null,
    recipientId: recipientId || null,
    senderId: senderId || 'anonymous',
    text: sanitizedText,
    timestamp: new Date().toISOString(),
  };

  return message;
}

module.exports = {
  processMessage,
};
