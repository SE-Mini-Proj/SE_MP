const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const http = require('http');
const { setTimeout, clearTimeout } = require('node:timers');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initializeSocket } = require('../src/sockets');
const { generateToken } = require('../src/services/authService');

jest.mock('../src/cache/redisPubSub', () => ({
  INSTANCE_ID: 'test-instance',
  CHANNELS: {
    MESSAGES: 'chat:messages',
    ROOM_EVENTS: 'chat:room-events',
    PRESENCE: 'chat:presence',
  },
  publishMessage: jest.fn().mockResolvedValue(undefined),
  publishRoomEvent: jest.fn().mockResolvedValue(undefined),
  publishPresenceEvent: jest.fn().mockResolvedValue(undefined),
  initializePubSub: jest.fn().mockResolvedValue(undefined),
  closePubSub: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/cache/presenceService', () => ({
  registerSession: jest.fn().mockResolvedValue({
    userId: 'user_tester_1',
    socketId: 'test-socket',
    instanceId: 'test-instance',
    connectedAt: new Date().toISOString(),
    isFirstSession: true,
  }),
  removeSession: jest.fn().mockResolvedValue({
    removed: true,
    userOnline: false,
    results: [],
  }),
  getUserSessions: jest.fn().mockResolvedValue([]),
  isUserOnline: jest.fn().mockResolvedValue(false),
  getOnlineUsers: jest.fn().mockResolvedValue([]),
}));

describe('WebSocket Gateway - Socket.IO Integration', () => {
  let server;
  let socketServer;
  let serverPort;
  let clientSocket;

  beforeAll(async () => {
    server = http.createServer(app);
    socketServer = initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }

    if (socketServer && socketServer.io) {
      await new Promise((resolve) => socketServer.io.close(resolve));
    } else if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('should connect with a valid JWT and receive connection-ack', async () => {
    await new Promise((resolve, reject) => {
      clientSocket = ioClient(`http://127.0.0.1:${serverPort}`, {
        auth: {
          token: generateToken({
            id: 'user_tester_1',
            email: 'tester@example.com',
            username: 'tester',
          }).token,
        },
        transports: ['websocket'],
      });

      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for connection-ack'));
      }, 10000);

      clientSocket.once('connection-ack', (ack) => {
        clearTimeout(timeout);

        try {
          expect(ack.status).toBe('connected');
          expect(ack.user.id).toBe('user_tester_1');
          expect(ack.user.authenticated).toBe(true);
          expect(ack).toHaveProperty('timestamp');
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      clientSocket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }, 15000);


  it('should reject a connection without a JWT', async () => {
    const unauthenticatedClient = ioClient(
      `http://127.0.0.1:${serverPort}`,
      {
        transports: ['websocket'],
        reconnection: false,
      }
    );

    try {
      const error = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for authentication rejection')),
          5000
        );

        unauthenticatedClient.once('connect', () => {
          clearTimeout(timeout);
          reject(new Error('Unauthenticated client unexpectedly connected'));
        });

        unauthenticatedClient.once('connect_error', (err) => {
          clearTimeout(timeout);
          resolve(err);
        });
      });

      expect(error.message).toMatch(/Authentication required/);
    } finally {
      unauthenticatedClient.disconnect();
    }
  }, 10000);

  it('should reject an invalid JWT', async () => {
    const unauthenticatedClient = ioClient(
      `http://127.0.0.1:${serverPort}`,
      {
        auth: { token: 'not-a-valid-jwt' },
        transports: ['websocket'],
        reconnection: false,
      }
    );

    try {
      const error = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for authentication rejection')),
          5000
        );

        unauthenticatedClient.once('connect', () => {
          clearTimeout(timeout);
          reject(new Error('Client with invalid JWT unexpectedly connected'));
        });

        unauthenticatedClient.once('connect_error', (err) => {
          clearTimeout(timeout);
          resolve(err);
        });
      });

      expect(error.message).toMatch(/Invalid or expired authentication token/);
    } finally {
      unauthenticatedClient.disconnect();
    }
  }, 10000);

  it('should reject socket events after the JWT expires', async () => {
    const expiringClient = ioClient(`http://127.0.0.1:${serverPort}`, {
      auth: {
        token: generateToken({
          id: 'user_expiring',
          email: 'expiring@example.com',
          username: 'expiring',
        }, 1).token,
      },
      transports: ['websocket'],
      reconnection: false,
    });

    try {
      await new Promise((resolve, reject) => {
        expiringClient.once('connect', resolve);
        expiringClient.once('connect_error', reject);
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const authError = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for the authentication error')),
          5000
        );
        expiringClient.once('auth:error', (error) => {
          clearTimeout(timeout);
          resolve(error);
        });
      });
      expiringClient.emit('message:send', { text: 'must not be processed' });

      await expect(authError).resolves.toMatchObject({ code: 'INVALID_TOKEN' });
    } finally {
      expiringClient.disconnect();
    }
  }, 10000);

  it('should echo or broadcast sent messages via message:receive', async () => {
    const testPayload = {
      text: 'Hello, Antigravity Chat!',
      clientMsgId: 'client_msg_12345',
    };

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for message:receive'));
      }, 10000);

      clientSocket.once('message:receive', (receivedMsg) => {
        clearTimeout(timeout);

        try {
          expect(receivedMsg.text).toBe(testPayload.text);
          expect(receivedMsg.clientMsgId).toBe(testPayload.clientMsgId);
          expect(receivedMsg).toHaveProperty('messageId');
          expect(receivedMsg).toHaveProperty('timestamp');
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      clientSocket.emit('message:send', testPayload);
    });
  }, 15000);
});
