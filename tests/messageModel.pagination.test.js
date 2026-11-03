const { describe, it, expect, beforeEach } = require('@jest/globals');

const mockDbQuery = jest.fn();

jest.mock('../src/db', () => ({
  query: (...args) => mockDbQuery(...args),
}));

const MessageModel = require('../src/models/messageModel');

describe('MessageModel.findByRoomId pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a composite cursor and returns tied-timestamp messages chronologically', async () => {
    const timestamp = '2026-11-01T10:00:00.000Z';

    const newerMessage = {
      id: '22222222-2222-4222-8222-222222222222',
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'Newer message',
      created_at: timestamp,
      delivered: false,
    };

    const olderMessage = {
      id: '11111111-1111-4111-8111-111111111111',
      room_id: 'room-1',
      sender_id: 'user-1',
      content: 'Older message',
      created_at: timestamp,
      delivered: false,
    };

    // Database returns DESC order. The model should reverse it.
    mockDbQuery.mockResolvedValue({
      rows: [newerMessage, olderMessage],
    });

    const result = await MessageModel.findByRoomId({
      roomId: 'room-1',
      limit: 2,
      before: {
        createdAt: timestamp,
        id: '33333333-3333-4333-8333-333333333333',
      },
    });

    const [sql, params] = mockDbQuery.mock.calls[0];

    expect(sql).toContain(
      '(m.created_at, m.id) < ($2::timestamptz, $3::uuid)'
    );
    expect(sql).toContain(
      'ORDER BY m.created_at DESC, m.id DESC LIMIT $4'
    );

    expect(params).toEqual([
      'room-1',
      timestamp,
      '33333333-3333-4333-8333-333333333333',
      2,
    ]);

    expect(result.map((message) => message.id)).toEqual([
      olderMessage.id,
      newerMessage.id,
    ]);

    expect(result[0].createdAt).toEqual(timestamp);
    expect(result[1].createdAt).toEqual(timestamp);
  });
});
