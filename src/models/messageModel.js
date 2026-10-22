const db = require('../db');
const { sanitizeMessage } = require('../utils/sanitizer');

/**
 * Message Model & Database Repository
 * Supports paginated history retrieval for direct and room messaging (Issue #2 & SAD §3.4)
 */
class MessageModel {
  constructor({ id, room_id, sender_id, recipient_id, content, created_at, delivered = false }) {
    this.id = id;
    this.roomId = room_id;
    this.senderId = sender_id;
    this.recipientId = recipient_id;
    this.content = content;
    this.createdAt = created_at || new Date();
    this.delivered = Boolean(delivered);
  }

  static async create({ roomId = null, senderId, recipientId = null, content, delivered = false }) {
    const safeContent = sanitizeMessage(content);
    const queryText = `
      INSERT INTO messages (room_id, sender_id, recipient_id, content, delivered)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, room_id, sender_id, recipient_id, content, delivered, created_at;
    `;
    const res = await db.query(queryText, [roomId, senderId, recipientId, safeContent, delivered]);
    return new MessageModel(res.rows[0]);
  }

  static async findByRoomId({ roomId, limit = 50, before = null }) {
    let queryText = `
      SELECT m.*, u.username AS sender_username
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = $1
    `;
    const params = [roomId];

    if (before) {
      params.push(before);
      queryText += ` AND m.created_at < $${params.length}`;
    }

    params.push(limit);
    queryText += ` ORDER BY m.created_at DESC LIMIT $${params.length};`;

    const res = await db.query(queryText, params);
    return res.rows.map((row) => new MessageModel(row));
  }

  static async findDirectConversation({ user1Id, user2Id, limit = 50, before = null }) {
    let queryText = `
      SELECT m.*, u.username AS sender_username
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id IS NULL
        AND ((m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1))
    `;
    const params = [user1Id, user2Id];

    if (before) {
      params.push(before);
      queryText += ` AND m.created_at < $${params.length}`;
    }

    params.push(limit);
    queryText += ` ORDER BY m.created_at DESC LIMIT $${params.length};`;

    const res = await db.query(queryText, params);
    return res.rows.map((row) => new MessageModel(row));
  }

  static async markDelivered(messageId) {
    const queryText = 'UPDATE messages SET delivered = true WHERE id = $1 RETURNING *;';
    const res = await db.query(queryText, [messageId]);
    if (res.rows.length === 0) return null;
    return new MessageModel(res.rows[0]);
  }
}

module.exports = MessageModel;
