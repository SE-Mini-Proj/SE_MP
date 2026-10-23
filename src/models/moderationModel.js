const db = require('../db');

/**
 * Moderation Model & Database Repository
 * Manages room bans and room mutes
 */
class ModerationModel {
  static async banUser({ roomId, userId, bannedBy, reason = null }) {
    const queryText = `
      INSERT INTO room_bans (room_id, user_id, banned_by, reason)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (room_id, user_id) DO UPDATE SET
        banned_by = EXCLUDED.banned_by,
        reason = EXCLUDED.reason,
        created_at = CURRENT_TIMESTAMP
      RETURNING room_id, user_id, banned_by, reason, created_at;
    `;
    const res = await db.query(queryText, [roomId, userId, bannedBy, reason]);
    return res.rows[0];
  }

  static async unbanUser({ roomId, userId }) {
    const queryText = `
      DELETE FROM room_bans
      WHERE room_id = $1 AND user_id = $2
      RETURNING room_id, user_id;
    `;
    const res = await db.query(queryText, [roomId, userId]);
    return res.rows.length > 0;
  }

  static async isBanned({ roomId, userId }) {
    const queryText = `
      SELECT 1 FROM room_bans
      WHERE room_id = $1 AND user_id = $2
      LIMIT 1;
    `;
    const res = await db.query(queryText, [roomId, userId]);
    return res.rows.length > 0;
  }

  static async getBannedUsers(roomId) {
    const queryText = `
      SELECT rb.*, u.username, u.email
      FROM room_bans rb
      JOIN users u ON u.id = rb.user_id
      WHERE rb.room_id = $1
      ORDER BY rb.created_at DESC;
    `;
    const res = await db.query(queryText, [roomId]);
    return res.rows;
  }

  static async muteUser({ roomId, userId, mutedBy, mutedUntil = null, reason = null }) {
    const queryText = `
      INSERT INTO room_mutes (room_id, user_id, muted_by, muted_until, reason)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (room_id, user_id) DO UPDATE SET
        muted_by = EXCLUDED.muted_by,
        muted_until = EXCLUDED.muted_until,
        reason = EXCLUDED.reason,
        created_at = CURRENT_TIMESTAMP
      RETURNING room_id, user_id, muted_by, muted_until, reason, created_at;
    `;
    const res = await db.query(queryText, [roomId, userId, mutedBy, mutedUntil, reason]);
    return res.rows[0];
  }

  static async unmuteUser({ roomId, userId }) {
    const queryText = `
      DELETE FROM room_mutes
      WHERE room_id = $1 AND user_id = $2
      RETURNING room_id, user_id;
    `;
    const res = await db.query(queryText, [roomId, userId]);
    return res.rows.length > 0;
  }

  static async isMuted({ roomId, userId }) {
    const queryText = `
      SELECT room_id, user_id, muted_until FROM room_mutes
      WHERE room_id = $1 AND user_id = $2
      LIMIT 1;
    `;
    const res = await db.query(queryText, [roomId, userId]);
    if (res.rows.length === 0) return false;

    const row = res.rows[0];
    if (row.muted_until && new Date(row.muted_until) < new Date()) {
      // Mute has expired, clean up lazily
      await this.unmuteUser({ roomId, userId });
      return false;
    }
    return true;
  }

  static async getMutedUsers(roomId) {
    const queryText = `
      SELECT rm.*, u.username, u.email
      FROM room_mutes rm
      JOIN users u ON u.id = rm.user_id
      WHERE rm.room_id = $1
      ORDER BY rm.created_at DESC;
    `;
    const res = await db.query(queryText, [roomId]);
    return res.rows;
  }
}

module.exports = ModerationModel;
