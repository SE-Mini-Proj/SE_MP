const db = require('../db');

class DeviceTokenModel {
  static async upsert({ userId, token }) {
    await db.query(
      `INSERT INTO device_push_tokens (user_id, token)
       VALUES ($1, $2)
       ON CONFLICT (token)
       DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = CURRENT_TIMESTAMP;`,
      [userId, token]
    );
  }

  static async findByUserId(userId) {
    const result = await db.query(
      'SELECT token FROM device_push_tokens WHERE user_id = $1;',
      [userId]
    );
    return result.rows.map((row) => row.token);
  }

  static async delete({ userId, token }) {
    const result = await db.query(
      'DELETE FROM device_push_tokens WHERE user_id = $1 AND token = $2 RETURNING token;',
      [userId, token]
    );
    return result.rowCount > 0;
  }

  static async deleteInvalid(tokens) {
    if (!tokens.length) return;
    await db.query(
      'DELETE FROM device_push_tokens WHERE token = ANY($1::text[]);',
      [tokens]
    );
  }
}

module.exports = DeviceTokenModel;
