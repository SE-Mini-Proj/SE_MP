const { describe, it, expect } = require('@jest/globals');
const { registerUser, loginUser } = require('../src/services/authService');
const { createRoom, joinRoom } = require('../src/services/roomService');
const { processMessage } = require('../src/services/messagingService');

describe('Auth service', () => {
  it('returns the registered user details without exposing the password', async () => {
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
  });

  it('returns a login token and matching user email', async () => {
    const result = await loginUser({
      email: 'alice@example.com',
      password: 'not-returned',
    });

    expect(result.status).toBe('ok');
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe('alice@example.com');
  });
});

describe('Room service', () => {
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
    expect(result.room.id).toBeTruthy();
  });

  it('joins a room for the provided user', async () => {
    await expect(joinRoom({ roomId: 'room-1', userId: 'user-2' })).resolves.toEqual({
      status: 'ok',
      roomId: 'room-1',
      members: ['user-2'],
    });
  });
});

describe('Messaging service', () => {
  it('trims message text and preserves correlation metadata', async () => {
    const result = await processMessage({
      roomId: 'room-1',
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
    await expect(processMessage({ text: '   ' })).rejects.toMatchObject({
      code: 'EMPTY_MESSAGE',
      status: 400,
      message: 'Message text cannot be empty',
    });
  });
});
