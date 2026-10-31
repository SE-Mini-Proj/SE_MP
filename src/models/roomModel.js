const db = require('../db');

/**
 * Room Model & Database Repository
 * Handles room creation, membership, and private-room invitations.
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

  /**
   * Create a room and add its owner as the initial member.
   */
  static async create({ name, isPrivate = false, ownerId = null }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const roomResult = await client.query(
        `INSERT INTO rooms (name, is_private, owner_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, is_private, owner_id, created_at, updated_at;`,
        [name, isPrivate, ownerId]
      );

      const room = new RoomModel(roomResult.rows[0]);

      if (ownerId) {
        await client.query(
          `INSERT INTO room_members (room_id, user_id, role)
           VALUES ($1, $2, 'owner');`,
          [room.id, ownerId]
        );
      }

      await client.query('COMMIT');
      return room;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          '[Room Model] Failed to roll back room creation:',
          rollbackError.message
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find a room by ID.
   */
  static async findById(id) {
    const result = await db.query(
      'SELECT * FROM rooms WHERE id = $1 LIMIT 1;',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return new RoomModel(result.rows[0]);
  }

  /**
   * Add a member without changing the role of an existing member.
   */
  static async addMember({ roomId, userId, role = 'member' }) {
    const queryText = `
      INSERT INTO room_members (room_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (room_id, user_id) DO NOTHING
      RETURNING room_id, user_id, role, joined_at;
    `;

    const result = await db.query(queryText, [roomId, userId, role]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // The user may already be a member. Return their existing membership
    // without changing their role.
    const existingResult = await db.query(
      `SELECT room_id, user_id, role, joined_at
       FROM room_members
       WHERE room_id = $1 AND user_id = $2
       LIMIT 1;`,
      [roomId, userId]
    );

    return existingResult.rows[0] || null;
  }

  /**
   * Retrieve all members of a room.
   */
  static async getMembers(roomId) {
    const queryText = `
      SELECT u.id, u.username, u.email, rm.role, rm.joined_at
      FROM room_members rm
      JOIN users u ON u.id = rm.user_id
      WHERE rm.room_id = $1
      ORDER BY rm.joined_at ASC;
    `;

    const result = await db.query(queryText, [roomId]);

    return result.rows;
  }

  /**
   * Retrieve a user's role in a room.
   */
  static async getMemberRole(roomId, userId) {
    const roomResult = await db.query(
      'SELECT owner_id FROM rooms WHERE id = $1 LIMIT 1;',
      [roomId]
    );

    if (
      roomResult.rows.length > 0
      && roomResult.rows[0].owner_id === userId
    ) {
      return 'owner';
    }

    const memberResult = await db.query(
      `SELECT role
       FROM room_members
       WHERE room_id = $1 AND user_id = $2
       LIMIT 1;`,
      [roomId, userId]
    );

    if (memberResult.rows.length > 0) {
      return memberResult.rows[0].role;
    }

    return null;
  }

  /**
   * Remove a member from a room.
   */
  static async removeMember({ roomId, userId }) {
    const result = await db.query(
      `DELETE FROM room_members
       WHERE room_id = $1 AND user_id = $2
       RETURNING room_id, user_id;`,
      [roomId, userId]
    );

    return result.rows.length > 0;
  }

  /**
   * Check whether a user belongs to a room.
   */
  static async isMember({ roomId, userId }) {
    const role = await RoomModel.getMemberRole(roomId, userId);
    return role !== null;
  }

  /**
   * Create an invitation for a private room.
   *
   * tokenHash must be a SHA-256 hash of the raw invitation token.
   * Returns null if the room does not exist or is not private.
   */
  static async createInvite({
    roomId,
    tokenHash,
    createdBy,
    expiresAt,
  }) {
    const queryText = `
      INSERT INTO room_invites (
        room_id,
        token_hash,
        created_by,
        expires_at
      )
      SELECT $1, $2, $3, $4
      WHERE EXISTS (
        SELECT 1
        FROM rooms
        WHERE id = $1 AND is_private = TRUE
      )
      RETURNING id, room_id, created_by, expires_at, created_at;
    `;

    const result = await db.query(queryText, [
      roomId,
      tokenHash,
      createdBy,
      expiresAt,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Find an unexpired, non-revoked invitation for a specific room.
   */
  static async findValidInvite({ roomId, tokenHash }) {
    const queryText = `
      SELECT id, room_id, created_by, expires_at
      FROM room_invites
      WHERE room_id = $1
        AND token_hash = $2
        AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1;
    `;

    const result = await db.query(queryText, [roomId, tokenHash]);

    return result.rows[0] || null;
  }

  /**
   * Revoke an invitation.
   */
  static async revokeInvite({ inviteId, roomId }) {
    const queryText = `
      UPDATE room_invites
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND room_id = $2
        AND revoked_at IS NULL
      RETURNING id, room_id, revoked_at;
    `;

    const result = await db.query(queryText, [inviteId, roomId]);

    return result.rows[0] || null;
  }

  /**
   * Convenience alias for retrieving room membership.
   */
  static async getRoomMembers(roomId) {
    return RoomModel.getMembers(roomId);
  }
}

module.exports = RoomModel;
