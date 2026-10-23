const db = require('../db');

/**
 * Audit Log Model & Database Repository
 * Satisfies CHAT-SR-005 (STRIDE Repudiation mitigation, TC-Sec-05)
 */
class AuditLogModel {
  constructor({ id, actor_id, action, target_type, target_id, room_id, metadata = {}, created_at }) {
    this.id = id;
    this.actorId = actor_id;
    this.action = action;
    this.targetType = target_type;
    this.targetId = target_id;
    this.roomId = room_id;
    this.metadata = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {});
    this.createdAt = created_at ? new Date(created_at) : new Date();
  }

  static async create({ actorId, action, targetType, targetId = null, roomId = null, metadata = {} }) {
    const safeMetadata = typeof metadata === 'object' && metadata !== null ? JSON.stringify(metadata) : '{}';
    const queryText = `
      INSERT INTO audit_logs (actor_id, action, target_type, target_id, room_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, actor_id, action, target_type, target_id, room_id, metadata, created_at;
    `;
    const res = await db.query(queryText, [actorId, action, targetType, targetId, roomId, safeMetadata]);
    return new AuditLogModel(res.rows[0]);
  }

  static async findByRoomId({ roomId, limit = 50, before = null }) {
    let queryText = 'SELECT * FROM audit_logs WHERE room_id = $1';
    const params = [roomId];

    if (before) {
      params.push(before);
      queryText += ` AND created_at < $${params.length}`;
    }

    params.push(limit);
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length};`;

    const res = await db.query(queryText, params);
    return res.rows.map((row) => new AuditLogModel(row));
  }

  static async findByActorId({ actorId, limit = 50, before = null }) {
    let queryText = 'SELECT * FROM audit_logs WHERE actor_id = $1';
    const params = [actorId];

    if (before) {
      params.push(before);
      queryText += ` AND created_at < $${params.length}`;
    }

    params.push(limit);
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length};`;

    const res = await db.query(queryText, params);
    return res.rows.map((row) => new AuditLogModel(row));
  }

  toJSON() {
    return {
      id: this.id,
      actorId: this.actorId,
      action: this.action,
      targetType: this.targetType,
      targetId: this.targetId,
      roomId: this.roomId,
      metadata: this.metadata,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

module.exports = AuditLogModel;
