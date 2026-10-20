/**
 * User Model Schema definition
 * Corresponds to PostgreSQL users table in Issue #2
 */
class UserModel {
  constructor({ id, username, email, passwordHash, createdAt }) {
    this.id = id;
    this.username = username;
    this.email = email;
    this.passwordHash = passwordHash;
    this.createdAt = createdAt || new Date();
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      createdAt: this.createdAt,
    };
  }
}

module.exports = UserModel;
