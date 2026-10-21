
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { setTimeout, clearTimeout } from 'node:timers';
import ioClient from 'socket.io-client';
import app from '../src/app';
import { initializeSocket } from '../src/sockets';

// Mock Redis Pub/Sub so the tests do not require a running Redis server.
vi.mock('../src/cache/redisPubSub', () => ({
  INSTANCE_ID: 'test-instance',
  CHANNELS: {
    MESSAGES: 'chat:messages',
    ROOM_EVENTS: 'chat:room-events',
    PRESENCE: 'chat:presence',
  },
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishRoomEvent: vi.fn().mockResolvedValue(undefined),
  publishPresenceEvent: vi.fn().mockResolvedValue(undefined),
  initializePubSub: vi.fn().mockResolvedValue(undefined),
  closePubSub: vi.fn().mockResolvedValue(undefined),
}));

// Mock presence storage for isolated Socket.IO tests.
vi.mock('../src/cache/presenceService', () => ({
  registerSession: vi.fn().mockResolvedValue({
    userId: 'user_tester_1',
    socketId: 'test-socket',
    instanceId: 'test-instance',
    connectedAt: new Date().toISOString(),
  }),
  removeSession: vi.fn().mockResolvedValue({
    removed: true,
    userOnline: false,
    results: [],
  }),
  getUserSessions: vi.fn().mockResolvedValue([]),
  isUserOnline: vi.fn().mockResolvedValue(false),
  getOnlineUsers: vi.fn().mockResolvedValue([]),
}));

describe('WebSocket Gateway - Socket.IO Integration', () => {
  let server;
  let serverPort;
  let clientSocket;

  beforeAll(async () => {
    server = http.createServer(app);
    initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  it('should connect and receive connection:ack event', async () => {
    await new Promise((resolve, reject) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: {
          token: 'mock_jwt_for_test',
          userId: 'user_tester_1',
        },
        transports: ['websocket'],
      });

      clientSocket.once('connection:ack', (ack) => {
        try {
          expect(ack.status).toBe('connected');
          expect(ack.user.id).toBe('user_tester_1');
          expect(ack).toHaveProperty('timestamp');
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      clientSocket.once('connect_error', reject);
    });
  });

  it('should echo or broadcast sent messages via message:receive', async () => {
    const testPayload = {
      text: 'Hello, Antigravity Chat!',
      clientMsgId: 'client_msg_12345',
    };

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for message:receive'));
      }, 4000);

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
  });
});