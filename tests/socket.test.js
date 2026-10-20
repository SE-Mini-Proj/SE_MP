import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import ioClient from 'socket.io-client';
import app from '../src/app';
import { initializeSocket } from '../src/sockets';

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
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    await new Promise((resolve) => server.close(resolve));
  });

  it('should connect and receive connection:ack event', async () => {
    await new Promise((resolve, reject) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'mock_jwt_for_test', userId: 'user_tester_1' },
        transports: ['websocket'],
      });

      clientSocket.on('connection:ack', (ack) => {
        expect(ack.status).toBe('connected');
        expect(ack.user.id).toBe('user_tester_1');
        expect(ack).toHaveProperty('timestamp');
        resolve();
      });

      clientSocket.on('connect_error', (err) => reject(err));
    });
  });

  it('should echo or broadcast sent messages via message:receive', async () => {
    const testPayload = {
      text: 'Hello, Antigravity Chat!',
      clientMsgId: 'client_msg_12345',
    };

    await new Promise((resolve) => {
      clientSocket.on('message:receive', (receivedMsg) => {
        expect(receivedMsg.text).toBe(testPayload.text);
        expect(receivedMsg.clientMsgId).toBe(testPayload.clientMsgId);
        expect(receivedMsg).toHaveProperty('messageId');
        expect(receivedMsg).toHaveProperty('timestamp');
        resolve();
      });

      clientSocket.emit('message:send', testPayload);
    });
  });
});
