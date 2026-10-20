const db = require('../db');

/**
 * User Model & Database Repository
 * Corresponds to PostgreSQL users table in Issue #2
 */
class UserModel {
  constructor({ id, username, email, password_hash, created_at, updated_at }) {
    this.id = id;
    this.username = username;
    this.email = email;
    this.passwordHash = password_hash;
    this.createdAt = created_at || new Date();
    this.updatedAt = updated_at || new Date();
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      createdAt: this.createdAt,
    };
  }

  static async create({ username, email, passwordHash }) {
    const queryText = `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, created_at, updated_at;
    `;
    const res = await db.query(queryText, [username, email, passwordHash]);
    return new UserModel(res.rows[0]);
  }

  static async findByEmail(email) {
    const queryText = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;';
    const res = await db.query(queryText, [email]);
    if (res.rows.length === 0) return null;
    return new UserModel(res.rows[0]);
  }

  static async findByUsername(username) {
    const queryText = 'SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1;';
    const res = await db.query(queryText, [username]);
    if (res.rows.length === 0) return null;
    return new UserModel(res.rows[0]);
  }

  static async findById(id) {
    const queryText = 'SELECT * FROM users WHERE id = $1 LIMIT 1;';
    const res = await db.query(queryText, [id]);
    if (res.rows.length === 0) return null;
    return new UserModel(res.rows[0]);
  }
}

module.exports = UserModel;
