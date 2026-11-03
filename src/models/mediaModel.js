const db = require('../db');

class MediaModel {
  static async create({ roomId, uploaderId, storageKey, fileName, contentType, size }) {
    const result = await db.query(
      `INSERT INTO media_attachments (
         room_id, uploader_id, storage_key, file_name, content_type, file_size
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, room_id, uploader_id, storage_key, file_name, content_type,
                 file_size, created_at;`,
      [roomId, uploaderId, storageKey, fileName, contentType, size]
    );

    return result.rows[0];
  }

  static async findById(id) {
    const result = await db.query(
      `SELECT m.id, m.room_id, m.uploader_id, m.storage_key, m.file_name,
              m.content_type, m.file_size, m.created_at,
              u.username AS uploader_name
       FROM media_attachments m
       LEFT JOIN users u ON u.id = m.uploader_id
       WHERE m.id = $1
       LIMIT 1;`,
      [id]
    );

    return result.rows[0] || null;
  }

  static async listByRoomId(roomId) {
    const result = await db.query(
      `SELECT m.id, m.room_id, m.uploader_id, m.file_name, m.content_type,
              m.file_size, m.created_at, u.username AS uploader_name
       FROM media_attachments m
       LEFT JOIN users u ON u.id = m.uploader_id
       WHERE m.room_id = $1
       ORDER BY m.created_at ASC, m.id ASC;`,
      [roomId]
    );

    return result.rows;
  }
}

module.exports = MediaModel;
