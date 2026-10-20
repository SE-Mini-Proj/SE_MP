/**
 * Message Model Schema definition
 */
class MessageModel {
  constructor({ id, roomId, senderId, recipientId, content, createdAt, delivered = false }) {
    this.id = id;
    this.roomId = roomId;
    this.senderId = senderId;
    this.recipientId = recipientId;
    this.content = content;
    this.createdAt = createdAt || new Date();
    this.delivered = delivered;
  }
}

module.exports = MessageModel;
