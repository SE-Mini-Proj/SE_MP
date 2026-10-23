const db = require('../db');

/**
 * Room Model & Database Repository
 */
class RoomModel {
  constructor({ id, name, is_private, owner_id, created_at, updated_at }) {
    this.id = id;
    this.name = name;
    this.isPrivate = Boolean(is_private);
    this.ownerId = owner_id;
    this.createdAt = created_at || new Date();
    this.updatedAt = updated_at || new Date();
  }

  static async create({ name, isPrivate = false, ownerId = null }) {
    const queryText = `
      INSERT INTO rooms (name, is_private, owner_id)
      VALUES ($1, $2, $3)
      RETURNING id, name, is_private, owner_id, created_at, updated_at;
    `;
    const res = await db.query(queryText, [name, isPrivate, ownerId]);
    const room = new RoomModel(res.rows[0]);

    if (ownerId) {
      await RoomModel.addMember({ roomId: room.id, userId: ownerId, role: 'owner' });
    }
    return room;
  }

  static async findById(id) {
    const queryText = 'SELECT * FROM rooms WHERE id = $1 LIMIT 1;';
    const res = await db.query(queryText, [id]);
    if (res.rows.length === 0) return null;
    return new RoomModel(res.rows[0]);
  }

  static async addMember({ roomId, userId, role = 'member' }) {
    const queryText = `
      INSERT INTO room_members (room_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role
      RETURNING room_id, user_id, role, joined_at;
    `;
    const res = await db.query(queryText, [roomId, userId, role]);
    return res.rows[0];
  }

  static async getMembers(roomId) {
    const queryText = `
      SELECT u.id, u.username, u.email, rm.role, rm.joined_at
      FROM room_members rm
      JOIN users u ON u.id = rm.user_id
      WHERE rm.room_id = $1
      ORDER BY rm.joined_at ASC;
    `;
    const res = await db.query(queryText, [roomId]);
    return res.rows;
  }

  static async getMemberRole(roomId, userId) {
    // Check if user is owner directly on room table
    const roomRes = await db.query('SELECT owner_id FROM rooms WHERE id = $1 LIMIT 1;', [roomId]);
    if (roomRes.rows.length > 0 && roomRes.rows[0].owner_id === userId) {
      return 'owner';
    }

    const memberRes = await db.query(
      'SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2 LIMIT 1;',
      [roomId, userId]
    );
    if (memberRes.rows.length > 0) {
      return memberRes.rows[0].role;
    }

    return null;
  }

  static async removeMember({ roomId, userId }) {
    const queryText = `
      DELETE FROM room_members
      WHERE room_id = $1 AND user_id = $2
      RETURNING room_id, user_id;
    `;
    const res = await db.query(queryText, [roomId, userId]);
    return res.rows.length > 0;
  }

  static async isMember({ roomId, userId }) {
    const role = await RoomModel.getMemberRole(roomId, userId);
    return role !== null;
  }
}

module.exports = RoomModel;
