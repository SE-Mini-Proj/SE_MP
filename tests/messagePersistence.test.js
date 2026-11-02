const { describe, it, expect, beforeEach, afterAll } = require('@jest/globals');

// Mock database pool
jest.mock('../src/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

const db = require('../src/db');
const MessageModel = require('../src/models/messageModel');
const messagingService = require('../src/services/messagingService');

describe('Functional Requirement: Message Persistence to PostgreSQL Database (Issue #23 - CHAT-F-040, TC-Hist-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    messagingService.clearInMemoryMessages();
  });

  afterAll(async () => {
    try {
      const { closePool } = require('../src/db/pool');
      await closePool();
    } catch {
      // ignore
    }
  });

  describe('TC-Hist-01.1: MessageModel Repository Operations', () => {
    it('creates and persists a room message record with correct fields in PostgreSQL', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        room_id: '123e4567-e89b-12d3-a456-426614174000',
        sender_id: '123e4567-e89b-12d3-a456-426614174002',
        recipient_id: null,
        content: 'Hello everyone in room!',
        delivered: false,
        created_at: new Date('2026-11-02T10:00:00Z'),
      };

      db.query.mockResolvedValueOnce({ rows: [mockRow] });

      const message = await MessageModel.create({
        roomId: mockRow.room_id,
        senderId: mockRow.sender_id,
        content: 'Hello everyone in room!',
        delivered: false,
      });

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO messages');
      expect(params).toEqual([
        mockRow.room_id,
        mockRow.sender_id,
        null,
        'Hello everyone in room!',
        false,
      ]);

      expect(message).toBeInstanceOf(MessageModel);
      expect(message.id).toBe(mockRow.id);
      expect(message.roomId).toBe(mockRow.room_id);
      expect(message.senderId).toBe(mockRow.sender_id);
      expect(message.content).toBe(mockRow.content);
      expect(message.delivered).toBe(false);
      expect(message.createdAt).toEqual(mockRow.created_at);

      const json = message.toJSON();
      expect(json).toMatchObject({
        id: mockRow.id,
        roomId: mockRow.room_id,
        senderId: mockRow.sender_id,
        content: mockRow.content,
        delivered: false,
      });
    });

    it('creates and persists a 1-to-1 direct message record in PostgreSQL', async () => {
      const mockRow = {
        id: '223e4567-e89b-12d3-a456-426614174001',
        room_id: null,
        sender_id: '223e4567-e89b-12d3-a456-426614174002',
        recipient_id: '223e4567-e89b-12d3-a456-426614174003',
        content: 'Direct confidential message',
        delivered: false,
        created_at: new Date('2026-11-02T10:05:00Z'),
      };

      db.query.mockResolvedValueOnce({ rows: [mockRow] });

      const message = await MessageModel.create({
        recipientId: mockRow.recipient_id,
        senderId: mockRow.sender_id,
        content: 'Direct confidential message',
        delivered: false,
      });

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO messages');
      expect(params[0]).toBeNull(); // room_id is null for direct message
      expect(params[1]).toBe(mockRow.sender_id);
      expect(params[2]).toBe(mockRow.recipient_id);
      expect(params[3]).toBe('Direct confidential message');

      expect(message.id).toBe(mockRow.id);
      expect(message.recipientId).toBe(mockRow.recipient_id);
      expect(message.roomId).toBeNull();
    });

    it('marks a message as delivered in PostgreSQL (markDelivered)', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174001';
      const mockUpdatedRow = {
        id: messageId,
        room_id: 'room-1',
        sender_id: 'user-1',
        recipient_id: null,
        content: 'Delivered text',
        delivered: true,
        created_at: new Date(),
      };

      db.query.mockResolvedValueOnce({ rows: [mockUpdatedRow] });

      const updated = await MessageModel.markDelivered(messageId);

      expect(db.query).toHaveBeenCalledWith(
        'UPDATE messages SET delivered = true WHERE id = $1 RETURNING *;',
        [messageId]
      );
      expect(updated.delivered).toBe(true);
    });

    it('returns null when markDelivered targets a non-existent message', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const result = await MessageModel.markDelivered('non-existent-id');
      expect(result).toBeNull();
    });

    it('finds message by id (findById)', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174001';
      const mockRow = {
        id: messageId,
        room_id: 'room-1',
        sender_id: 'user-1',
        recipient_id: null,
        content: 'Found message',
        delivered: true,
        created_at: new Date(),
      };

      db.query.mockResolvedValueOnce({ rows: [mockRow] });

      const found = await MessageModel.findById(messageId);
      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM messages WHERE id = $1 LIMIT 1;',
        [messageId]
      );
      expect(found.id).toBe(messageId);
      expect(found.content).toBe('Found message');
    });

    it('deletes message by id (deleteById)', async () => {
      const messageId = '123e4567-e89b-12d3-a456-426614174001';
      db.query.mockResolvedValueOnce({ rows: [{ id: messageId }] });

      const deleted = await MessageModel.deleteById(messageId);
      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM messages WHERE id = $1 RETURNING *;',
        [messageId]
      );
      expect(deleted.id).toBe(messageId);
    });
  });

  describe('TC-Hist-01.2: messagingService Integration & AC-CHAT-F-040 Compliance', () => {
    it('persists message to database and returns formatted message payload', async () => {
      const mockRow = {
        id: 'msg-uuid-abc-123',
        room_id: 'room-persist-1',
        sender_id: 'user-persist-1',
        recipient_id: null,
        content: 'Sanitized persistent text',
        delivered: false,
        created_at: new Date('2026-11-02T11:00:00Z'),
      };

      db.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await messagingService.processMessage({
        roomId: 'room-persist-1',
        text: 'Sanitized persistent text',
        senderId: 'user-persist-1',
        clientMsgId: 'client-123',
        delivered: false,
      });

      expect(db.query).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        messageId: 'msg-uuid-abc-123',
        id: 'msg-uuid-abc-123',
        roomId: 'room-persist-1',
        senderId: 'user-persist-1',
        text: 'Sanitized persistent text',
        clientMsgId: 'client-123',
        delivered: false,
      });
      expect(result.timestamp).toBe(mockRow.created_at.toISOString());
    });

    it('marks message delivered and reflects state change (markMessageDelivered)', async () => {
      const messageId = 'msg-uuid-abc-123';
      db.query.mockResolvedValueOnce({
        rows: [{
          id: messageId,
          delivered: true,
          created_at: new Date(),
        }],
      });

      const updated = await messagingService.markMessageDelivered(messageId);
      expect(updated.delivered).toBe(true);
    });

    it('falls back gracefully to memory store when PostgreSQL query fails in unit test mode', async () => {
      db.query.mockRejectedValueOnce(new Error('Connection terminated'));

      const result = await messagingService.processMessage({
        roomId: 'room-fallback-1',
        text: 'Graceful fallback message',
        senderId: 'user-fallback',
        clientMsgId: 'client-fallback',
      });

      expect(result.messageId).toBeTruthy();
      expect(result.text).toBe('Graceful fallback message');
      expect(result.roomId).toBe('room-fallback-1');

      // Verify retrieval works via fallback
      const retrieved = await messagingService.getMessageById(result.messageId);
      expect(retrieved).not.toBeNull();
      expect(retrieved.content).toBe('Graceful fallback message');

      // Verify mark delivered works in fallback
      await messagingService.markMessageDelivered(result.messageId);
      const afterDelivered = await messagingService.getMessageById(result.messageId);
      expect(afterDelivered.delivered).toBe(true);
    });

    it('rejects empty messages without attempting database persistence', async () => {
      await expect(
        messagingService.processMessage({ text: '    ' })
      ).rejects.toMatchObject({
        code: 'EMPTY_MESSAGE',
        status: 400,
      });

      expect(db.query).not.toHaveBeenCalled();
    });
  });
});

