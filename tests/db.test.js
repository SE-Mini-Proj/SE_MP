const { describe, it, expect, afterAll } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { getPool, checkConnection, closePool } = require('../src/db/pool');
const UserModel = require('../src/models/userModel');
const RoomModel = require('../src/models/roomModel');
const MessageModel = require('../src/models/messageModel');
const AuditLogModel = require('../src/models/auditLogModel');

describe('Database Schema & PostgreSQL Integration (Issue #2)', () => {
  const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');

  afterAll(async () => {
    await closePool();
  });

  it('should have 001_initial_schema.up.sql migration file', () => {
    const upFile = path.join(migrationsDir, '001_initial_schema.up.sql');
    expect(fs.existsSync(upFile)).toBe(true);

    const sqlContent = fs.readFileSync(upFile, 'utf-8');
    // Verify core tables defined in Issue #2
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS rooms');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS room_members');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS messages');

    // Verify indexing requested in Issue #2
    expect(sqlContent).toContain('idx_messages_room_created');
    expect(sqlContent).toContain('idx_messages_direct_conv');
    expect(sqlContent).toContain('idx_room_members_user');
  });

  it('should have 001_initial_schema.down.sql rollback migration file', () => {
    const downFile = path.join(migrationsDir, '001_initial_schema.down.sql');
    expect(fs.existsSync(downFile)).toBe(true);

    const sqlContent = fs.readFileSync(downFile, 'utf-8');
    expect(sqlContent).toContain('DROP TABLE IF EXISTS messages');
    expect(sqlContent).toContain('DROP TABLE IF EXISTS room_members');
    expect(sqlContent).toContain('DROP TABLE IF EXISTS rooms');
    expect(sqlContent).toContain('DROP TABLE IF EXISTS users');
  });

  it('should properly configure PostgreSQL connection pool', () => {
    const pool = getPool();
    expect(pool).toBeDefined();
    expect(config.database.port).toBe(5432);
    expect(config.database.name).toBe('chat_db');
    expect(config.database.maxPoolSize).toBe(20);
  });

  it('checkConnection() should return connection status object without unhandled rejections', async () => {
    const status = await checkConnection();
    expect(status).toHaveProperty('connected');
    expect(typeof status.connected).toBe('boolean');
    if (!status.connected) {
      expect(status).toHaveProperty('error');
    }
  });

  it('should instantiate UserModel correctly', () => {
    const mockUser = new UserModel({
      id: '123e4567-e89b-12d3-a456-426614174000',
      username: 'alice',
      email: 'alice@example.com',
      password_hash: 'hashedpassword',
    });

    expect(mockUser.username).toBe('alice');
    expect(mockUser.email).toBe('alice@example.com');
    expect(mockUser.passwordHash).toBe('hashedpassword');

    const json = mockUser.toJSON();
    expect(json).not.toHaveProperty('passwordHash');
    expect(json.username).toBe('alice');
  });

  it('should instantiate RoomModel correctly', () => {
    const mockRoom = new RoomModel({
      id: '223e4567-e89b-12d3-a456-426614174000',
      name: 'Engineering',
      is_private: true,
      owner_id: '123e4567-e89b-12d3-a456-426614174000',
    });

    expect(mockRoom.name).toBe('Engineering');
    expect(mockRoom.isPrivate).toBe(true);
    expect(mockRoom.ownerId).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('should instantiate MessageModel correctly', () => {
    const mockMessage = new MessageModel({
      id: '323e4567-e89b-12d3-a456-426614174000',
      room_id: '223e4567-e89b-12d3-a456-426614174000',
      sender_id: '123e4567-e89b-12d3-a456-426614174000',
      content: 'Hello team!',
      delivered: true,
    });

    expect(mockMessage.content).toBe('Hello team!');
    expect(mockMessage.delivered).toBe(true);
    expect(mockMessage.roomId).toBe('223e4567-e89b-12d3-a456-426614174000');
  });

  it('should have 002_moderation_and_audit_logs.up.sql migration file', () => {
    const upFile = path.join(migrationsDir, '002_moderation_and_audit_logs.up.sql');
    expect(fs.existsSync(upFile)).toBe(true);

    const sqlContent = fs.readFileSync(upFile, 'utf-8');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS audit_logs');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS room_bans');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS room_mutes');
    expect(sqlContent).toContain('idx_audit_logs_room_created');
  });

  it('should have 002_moderation_and_audit_logs.down.sql rollback migration file', () => {
    const downFile = path.join(migrationsDir, '002_moderation_and_audit_logs.down.sql');
    expect(fs.existsSync(downFile)).toBe(true);

    const sqlContent = fs.readFileSync(downFile, 'utf-8');
    expect(sqlContent).toContain('DROP TABLE IF EXISTS audit_logs');
    expect(sqlContent).toContain('DROP TABLE IF EXISTS room_bans');
    expect(sqlContent).toContain('DROP TABLE IF EXISTS room_mutes');
  });

  it('should instantiate AuditLogModel correctly and format JSON', () => {
    const mockLog = new AuditLogModel({
      id: '423e4567-e89b-12d3-a456-426614174000',
      actor_id: '123e4567-e89b-12d3-a456-426614174000',
      action: 'MUTE_USER',
      target_type: 'user',
      target_id: '523e4567-e89b-12d3-a456-426614174000',
      room_id: '223e4567-e89b-12d3-a456-426614174000',
      metadata: { reason: 'spamming' },
      created_at: new Date('2026-10-23T12:00:00Z'),
    });

    expect(mockLog.action).toBe('MUTE_USER');
    expect(mockLog.targetType).toBe('user');
    expect(mockLog.metadata.reason).toBe('spamming');

    const json = mockLog.toJSON();
    expect(json.id).toBe('423e4567-e89b-12d3-a456-426614174000');
    expect(json.createdAt).toBe('2026-10-23T12:00:00.000Z');
  });
});
