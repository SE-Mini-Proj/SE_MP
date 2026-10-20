/**
 * Room Model Schema definition
 */
class RoomModel {
  constructor({ id, name, isPrivate, ownerId, createdAt }) {
    this.id = id;
    this.name = name;
    this.isPrivate = Boolean(isPrivate);
    this.ownerId = ownerId;
    this.createdAt = createdAt || new Date();
  }
}

module.exports = RoomModel;
