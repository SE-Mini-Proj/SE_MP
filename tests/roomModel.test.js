const { describe, it, expect, beforeEach } = require('@jest/globals');

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock('../src/db', () => ({
  getClient: jest.fn(async () => mockClient),
  query: jest.fn(),
}));

const db = require('../src/db');
const RoomModel = require('../src/models/roomModel');

describe('RoomModel.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.getClient.mockResolvedValue(mockClient);
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'room-1',
          name: 'Engineering',
          is_private: true,
          owner_id: 'user-1',
          created_at: new Date('2026-10-26T00:00:00.000Z'),
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
  });

  it('persists the room and owner membership atomically', async () => {
    const room = await RoomModel.create({
      name: 'Engineering',
      isPrivate: true,
      ownerId: 'user-1',
    });

    expect(room).toMatchObject({
      id: 'room-1',
      name: 'Engineering',
      isPrivate: true,
      ownerId: 'user-1',
    });
    expect(mockClient.query.mock.calls.map(([query]) => query.trim().split(/\s+/)[0]))
      .toEqual(['BEGIN', 'INSERT', 'INSERT', 'COMMIT']);
    expect(mockClient.query.mock.calls[2][0]).toContain("'owner'");
    expect(mockClient.query.mock.calls[2][1]).toEqual(['room-1', 'user-1']);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back room creation if owner membership insert fails', async () => {
    mockClient.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'room-1',
          name: 'Engineering',
          is_private: false,
          owner_id: 'user-1',
        }],
      })
      .mockRejectedValueOnce(new Error('membership insert failed'))
      .mockResolvedValueOnce({ rows: [] });

    await expect(RoomModel.create({
      name: 'Engineering',
      ownerId: 'user-1',
    })).rejects.toThrow('membership insert failed');

    expect(mockClient.query.mock.calls.map(([query]) => query.trim().split(/\s+/)[0]))
      .toEqual(['BEGIN', 'INSERT', 'INSERT', 'ROLLBACK']);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
