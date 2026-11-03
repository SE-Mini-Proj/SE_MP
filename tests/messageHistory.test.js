const { Buffer } = require('node:buffer');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../src/models/messageModel', () => ({
  findByRoomId: jest.fn(),
}));

jest.mock('../src/models/roomModel', () => ({
  findById: jest.fn(),
  getMemberRole: jest.fn(),
}));

const MessageModel = require('../src/models/messageModel');
const RoomModel = require('../src/models/roomModel');
const {
  getRoomMessageHistory,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require('../src/services/messageHistoryService');

const messages = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    content: 'First message',
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    content: 'Second message',
    createdAt: '2026-11-01T10:01:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    content: 'Third message',
    createdAt: '2026-11-01T10:02:00.000Z',
  },
];

describe('Message History Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RoomModel.findById.mockResolvedValue({ id: 'room-1' });
    RoomModel.getMemberRole.mockResolvedValue('member');
    MessageModel.findByRoomId.mockResolvedValue(messages);
  });

  it('returns messages in chronological order', async () => {
    const result = await getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      limit: 3,
    });

    expect(result.messages).toEqual(messages);
    expect(result.messages[0].createdAt).toBe(messages[0].createdAt);
    expect(result.messages[2].createdAt).toBe(messages[2].createdAt);
  });

  it('returns the requested page size and a composite next cursor', async () => {
    const result = await getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      limit: 2,
    });

    expect(MessageModel.findByRoomId).toHaveBeenCalledWith({
      roomId: 'room-1',
      limit: 3,
      before: null,
    });

    expect(result.messages).toHaveLength(2);
    expect(result.pagination.limit).toBe(2);
    expect(result.pagination.hasMore).toBe(true);

    const decodedCursor = JSON.parse(
      Buffer.from(result.pagination.nextCursor, 'base64url').toString('utf8')
    );

    expect(decodedCursor).toEqual({
      createdAt: messages[0].createdAt,
      id: messages[0].id,
    });
  });

  it('returns no next cursor when there are no additional messages', async () => {
    MessageModel.findByRoomId.mockResolvedValue([messages[0]]);

    const result = await getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      limit: 2,
    });

    expect(result.messages).toHaveLength(1);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBeNull();
  });

  it('uses the default page limit when limit is not provided', async () => {
    MessageModel.findByRoomId.mockResolvedValue([]);

    const result = await getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
    });

    expect(result.pagination.limit).toBe(DEFAULT_LIMIT);
    expect(MessageModel.findByRoomId).toHaveBeenCalledWith({
      roomId: 'room-1',
      limit: DEFAULT_LIMIT + 1,
      before: null,
    });
  });

  it('decodes and passes the composite cursor to the message model', async () => {
    const cursorData = {
      createdAt: messages[1].createdAt,
      id: messages[1].id,
    };
    const cursor = Buffer.from(JSON.stringify(cursorData)).toString('base64url');

    await getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      limit: 2,
      before: cursor,
    });

    expect(MessageModel.findByRoomId).toHaveBeenCalledWith({
      roomId: 'room-1',
      limit: 3,
      before: cursorData,
    });
  });

  it('rejects requests for rooms that do not exist', async () => {
    RoomModel.findById.mockResolvedValue(null);

    await expect(getRoomMessageHistory({
      roomId: 'missing-room',
      userId: 'user-1',
    })).rejects.toMatchObject({
      status: 404,
      code: 'ROOM_NOT_FOUND',
    });

    expect(MessageModel.findByRoomId).not.toHaveBeenCalled();
  });

  it('rejects users who are not members of the room', async () => {
    RoomModel.getMemberRole.mockResolvedValue(null);

    await expect(getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'outsider',
    })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });

    expect(MessageModel.findByRoomId).not.toHaveBeenCalled();
  });

  it('rejects limits below 1', async () => {
    await expect(getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      limit: 0,
    })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_LIMIT',
    });
  });

  it('rejects limits above the maximum', async () => {
    await expect(getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      limit: MAX_LIMIT + 1,
    })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_LIMIT',
    });
  });

  it('rejects non-integer limits', async () => {
    await expect(getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      limit: 2.5,
    })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_LIMIT',
    });
  });

  it('rejects malformed pagination cursors', async () => {
    await expect(getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      before: 'not-a-valid-cursor',
    })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_CURSOR',
    });
  });

  it('rejects cursors without a valid message ID', async () => {
    const invalidCursor = Buffer.from(JSON.stringify({
      createdAt: messages[0].createdAt,
      id: 'not-a-uuid',
    })).toString('base64url');

    await expect(getRoomMessageHistory({
      roomId: 'room-1',
      userId: 'user-1',
      before: invalidCursor,
    })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_CURSOR',
    });
  });

  it('rejects missing room and user identifiers', async () => {
    await expect(getRoomMessageHistory({
      roomId: 'room-1',
    })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});
