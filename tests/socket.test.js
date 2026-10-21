const { describe, it, expect, beforeAll, afterAll, jest } = require('@jest/globals');
const http = require('http');
const { setTimeout, clearTimeout } = require('node:timers');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initializeSocket } = require('../src/sockets');

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

  it('should connect and receive connection:ack event', async () => {
    await new Promise((resolve, reject) => {
      clientSocket = ioClient(`http://127.0.0.1:${serverPort}`, {
        auth: {
          token: 'mock_jwt_for_test',
          userId: 'user_tester_1',
        },
        transports: ['websocket'],
      });

      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for connection:ack'));
      }, 10000);

      clientSocket.once('connection:ack', (ack) => {
        clearTimeout(timeout);

        try {
          expect(ack.status).toBe('connected');
          expect(ack.user.id).toBe('user_tester_1');
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
