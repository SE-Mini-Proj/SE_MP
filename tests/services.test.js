const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../src/models/userModel', () => ({
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../src/models/roomModel', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  addMember: jest.fn(),
  getMembers: jest.fn(),
  getRoomMembers: jest.fn(),
  getMemberRole: jest.fn(),
  createInvite: jest.fn(),
  findValidInvite: jest.fn(),
  removeMember: jest.fn(),
  isMember: jest.fn(),
}));

jest.mock('../src/services/auditService', () => ({
  recordAuditLog: jest.fn().mockResolvedValue({ id: 'mock-audit-id' }),
  getAuditLogs: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/cache/redisPubSub', () => ({
  publishRoomEvent: jest.fn().mockResolvedValue(undefined),
  publishMessage: jest.fn().mockResolvedValue(undefined),
}));

const UserModel = require('../src/models/userModel');
const RoomModel = require('../src/models/roomModel');

const {
  registerUser,
  loginUser,
  verifyToken,
  getTokenLifetimeSeconds,
  MAX_TOKEN_LIFETIME_SECONDS,
} = require('../src/services/authService');
const {
  createRoom,
  createRoomInvite,
  joinRoom,
  removeMember,
} = require('../src/services/roomService');
const { processMessage } = require('../src/services/messagingService');

describe('Auth service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    UserModel.findByEmail.mockResolvedValue(null);
    UserModel.findByUsername.mockResolvedValue(null);
  });

  it('returns registered user details without exposing the password', async () => {
    UserModel.create.mockImplementation(async ({ username, email }) => ({
      toJSON: () => ({
        id: 'test-user-id',
        username,
        email,
        createdAt: new Date(),
      }),
    }));

    const result = await registerUser({
      username: 'alice',
      email: 'alice@example.com',
      password: 'not-returned',
    });

    expect(result.status).toBe('ok');
    expect(result.user).toMatchObject({
      username: 'alice',
      email: 'alice@example.com',
    });
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('returns a login token and matching user email', async () => {
    const result = await loginUser({
      email: 'alice@example.com',
      password: 'not-returned',
    });

    expect(result.status).toBe('ok');
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe('alice@example.com');

    const claims = verifyToken(result.token);

    expect(claims.sub).toBe(result.user.id);
    expect(claims.exp - claims.iat)
      .toBeLessThanOrEqual(MAX_TOKEN_LIFETIME_SECONDS);
  });

  it('caps configured JWT lifetimes at 24 hours', () => {
    expect(getTokenLifetimeSeconds('48h'))
      .toBe(MAX_TOKEN_LIFETIME_SECONDS);
  });
});

describe('Room service', () => {
  const publicRoom = {
    id: 'room-1',
    name: 'Engineering',
    isPrivate: false,
    ownerId: 'user-1',
  };

  const privateRoom = {
    id: 'private-room-1',
    name: 'Private Engineering',
    isPrivate: true,
    ownerId: 'user-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    RoomModel.create.mockImplementation(
      async ({ name, isPrivate, ownerId }) => ({
        id: 'room-1',
        name,
        isPrivate,
        ownerId,
        createdAt: '2026-10-26T00:00:00.000Z',
      })
    );

    RoomModel.findById.mockResolvedValue(publicRoom);

    RoomModel.addMember.mockResolvedValue({
      room_id: 'room-1',
      user_id: 'user-2',
      role: 'member',
    });

    const members = [
      { id: 'user-1', username: 'alice', role: 'owner' },
      { id: 'user-2', username: 'bob', role: 'member' },
    ];

    RoomModel.getMembers.mockResolvedValue(members);
    RoomModel.getRoomMembers.mockResolvedValue(members);
    RoomModel.getMemberRole.mockResolvedValue('owner');

    RoomModel.createInvite.mockResolvedValue({
      id: 'invite-1',
      room_id: 'private-room-1',
      created_by: 'user-1',
      expires_at: new Date(Date.now() + 3600000),
    });

    RoomModel.findValidInvite.mockResolvedValue({
      id: 'invite-1',
      room_id: 'private-room-1',
    });
  });

  it('creates a room with its owner as the initial member', async () => {
    const result = await createRoom({
      name: 'Engineering',
      ownerId: 'user-1',
      isPrivate: true,
    });

    expect(result.status).toBe('ok');

    expect(result.room).toMatchObject({
      name: 'Engineering',
      ownerId: 'user-1',
      isPrivate: true,
      members: ['user-1'],
    });

    expect(RoomModel.create).toHaveBeenCalledWith({
      name: 'Engineering',
      isPrivate: true,
      ownerId: 'user-1',
    });
  });

  it('rejects a blank room name or missing owner', async () => {
    await expect(
      createRoom({ name: '  ', ownerId: 'user-1' })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });

    await expect(
      createRoom({ name: 'Engineering' })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('joins a public room and returns its members', async () => {
    const result = await joinRoom({
      roomId: 'room-1',
      userId: 'user-2',
    });

    expect(RoomModel.findById).toHaveBeenCalledWith('room-1');

    expect(RoomModel.addMember).toHaveBeenCalledWith({
      roomId: 'room-1',
      userId: 'user-2',
      role: 'member',
    });

    expect(RoomModel.getRoomMembers).toHaveBeenCalledWith('room-1');

    expect(result).toMatchObject({
      status: 'ok',
      roomId: 'room-1',
    });

    expect(result.members).toHaveLength(2);
  });

  it('rejects joining a nonexistent room', async () => {
    RoomModel.findById.mockResolvedValue(null);

    await expect(
      joinRoom({
        roomId: 'missing-room',
        userId: 'user-2',
      })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });

    expect(RoomModel.addMember).not.toHaveBeenCalled();
  });

  it('rejects joining without an authenticated user', async () => {
    await expect(
      joinRoom({ roomId: 'room-1' })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });

    expect(RoomModel.addMember).not.toHaveBeenCalled();
  });

  it('rejects joining a private room without an invitation', async () => {
    RoomModel.findById.mockResolvedValue(privateRoom);

    await expect(
      joinRoom({
        roomId: 'private-room-1',
        userId: 'user-2',
      })
    ).rejects.toMatchObject({
      code: 'INVITE_REQUIRED',
      status: 403,
    });

    expect(RoomModel.findValidInvite).not.toHaveBeenCalled();
    expect(RoomModel.addMember).not.toHaveBeenCalled();
  });

  it('allows joining a private room with a valid invitation', async () => {
    const crypto = require('crypto');
    const inviteCode = 'test-invitation-token';

    RoomModel.findById.mockResolvedValue(privateRoom);

    const result = await joinRoom({
      roomId: 'private-room-1',
      userId: 'user-2',
      inviteCode,
    });

    const expectedHash = crypto
      .createHash('sha256')
      .update(inviteCode)
      .digest('hex');

    expect(RoomModel.findValidInvite).toHaveBeenCalledWith({
      roomId: 'private-room-1',
      tokenHash: expectedHash,
    });

    expect(RoomModel.addMember).toHaveBeenCalledWith({
      roomId: 'private-room-1',
      userId: 'user-2',
      role: 'member',
    });

    expect(result).toMatchObject({
      status: 'ok',
      roomId: 'private-room-1',
    });
  });

  it('rejects an invalid private-room invitation', async () => {
    RoomModel.findById.mockResolvedValue(privateRoom);
    RoomModel.findValidInvite.mockResolvedValue(null);

    await expect(
      joinRoom({
        roomId: 'private-room-1',
        userId: 'user-2',
        inviteCode: 'invalid-token',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_INVITE',
      status: 403,
    });

    expect(RoomModel.addMember).not.toHaveBeenCalled();
  });

  it('creates a private-room invitation for the owner', async () => {
    RoomModel.findById.mockResolvedValue(privateRoom);
    RoomModel.getMemberRole.mockResolvedValue('owner');

    const result = await createRoomInvite({
      roomId: 'private-room-1',
      userId: 'user-1',
    });

    expect(result.status).toBe('ok');
    expect(result.invitation.token).toBeTruthy();
    expect(result.invitation.roomId).toBe('private-room-1');

    expect(RoomModel.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'private-room-1',
        createdBy: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      })
    );

    expect(RoomModel.createInvite.mock.calls[0][0].tokenHash)
      .not.toBe(result.invitation.token);
  });

  it('rejects invitation creation by an ordinary room member', async () => {
    RoomModel.findById.mockResolvedValue(privateRoom);
    RoomModel.getMemberRole.mockResolvedValue('member');

    await expect(
      createRoomInvite({
        roomId: 'private-room-1',
        userId: 'user-2',
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });

    expect(RoomModel.createInvite).not.toHaveBeenCalled();
  });

  it('rejects invitation creation for a public room', async () => {
    RoomModel.findById.mockResolvedValue(publicRoom);

    await expect(
      createRoomInvite({
        roomId: 'room-1',
        userId: 'user-1',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_ROOM_TYPE',
      status: 400,
    });

    expect(RoomModel.createInvite).not.toHaveBeenCalled();
  });

  it('rejects invitation expiry greater than seven days', async () => {
    RoomModel.findById.mockResolvedValue(privateRoom);

    await expect(
      createRoomInvite({
        roomId: 'private-room-1',
        userId: 'user-1',
        expiresInHours: 169,
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });

    expect(RoomModel.createInvite).not.toHaveBeenCalled();
  });

  it('removes a member when requested by the room owner (CHAT-F-023, TC-Room-04)', async () => {
    RoomModel.findById.mockResolvedValue({
      id: 'room-1',
      ownerId: 'owner-1',
    });
    RoomModel.getMemberRole.mockResolvedValue('owner');
    RoomModel.removeMember.mockResolvedValue(true);

    const result = await removeMember({
      roomId: 'room-1',
      targetUserId: 'member-2',
      actorId: 'owner-1',
      reason: 'Disruptive behavior',
    });

    expect(result.status).toBe('ok');
    expect(result.removed).toBe(true);
    expect(result.userId).toBe('member-2');
    expect(RoomModel.removeMember).toHaveBeenCalledWith({
      roomId: 'room-1',
      userId: 'member-2',
    });
  });

  it('prohibits non-owners from removing room members (AC-CHAT-F-023)', async () => {
    RoomModel.findById.mockResolvedValue({
      id: 'room-1',
      ownerId: 'owner-1',
    });
    RoomModel.getMemberRole.mockResolvedValue('member');

    await expect(
      removeMember({
        roomId: 'room-1',
        targetUserId: 'member-3',
        actorId: 'member-2',
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
    expect(RoomModel.removeMember).not.toHaveBeenCalled();
  });

  it('prevents removing the room owner', async () => {
    RoomModel.findById.mockResolvedValue({
      id: 'room-1',
      ownerId: 'owner-1',
    });
    RoomModel.getMemberRole.mockResolvedValue('owner');

    await expect(
      removeMember({
        roomId: 'room-1',
        targetUserId: 'owner-1',
        actorId: 'owner-1',
      })
    ).rejects.toMatchObject({
      code: 'OPERATION_NOT_ALLOWED',
      status: 403,
    });
  });
});

describe('Messaging service', () => {
  it('trims message text and preserves correlation metadata', async () => {
    const result = await processMessage({
      roomId: 'room-1',
      recipientId: null,
      senderId: 'user-1',
      clientMsgId: 'client-1',
      text: '  Hello  ',
    });

    expect(result).toMatchObject({
      roomId: 'room-1',
      senderId: 'user-1',
      clientMsgId: 'client-1',
      text: 'Hello',
    });

    expect(result.messageId).toBeTruthy();
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('rejects empty or whitespace-only message text', async () => {
    await expect(
      processMessage({ text: '   ' })
    ).rejects.toMatchObject({
      code: 'EMPTY_MESSAGE',
      status: 400,
      message: 'Message text cannot be empty',
    });
  });
});
