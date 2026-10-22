const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');
const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const config = require('../src/config');
const { initializeSocket } = require('../src/sockets');

describe('Security Requirement: TLS 1.2+ Transport Security (Issue #6 - CHAT-SR-001, TC-Sec-01)', () => {
  let server;
  let ioInstance;
  let serverPort;

  beforeAll(async () => {
    server = http.createServer(app);
    const result = initializeSocket(server);
    ioInstance = result.io || result;

    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    config.tls.enforce = false;
    if (ioInstance) {
      await new Promise((resolve) => ioInstance.close(resolve));
    }
  });

  describe('TC-Sec-01: REST API TLS Enforcement', () => {
    it('TC-Sec-01.1: should redirect plaintext GET requests (301) to HTTPS when TLS is enforced', async () => {
      config.tls.enforce = true;

      const res = await request(app)
        .get('/api/health')
        .set('x-forwarded-proto', 'http')
        .set('host', 'chat.example.com');

      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('https://chat.example.com/api/health');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['strict-transport-security']).toContain('max-age=');
    });

    it('TC-Sec-01.2: should reject plaintext POST requests (403) with TLS_REQUIRED when TLS is enforced', async () => {
      config.tls.enforce = true;

      const res = await request(app)
        .post('/api/auth/register')
        .set('x-forwarded-proto', 'http')
        .send({ username: 'testuser', email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        code: 'TLS_REQUIRED',
        message: 'TLS 1.2+ is mandatory. Plaintext HTTP connections are not permitted.',
      });
    });

    it('TC-Sec-01.3: should allow HTTPS requests and attach HSTS header when TLS is enforced', async () => {
      config.tls.enforce = true;

      const res = await request(app)
        .get('/api/health')
        .set('x-forwarded-proto', 'https');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains; preload');
    });

    it('TC-Sec-01.4: should allow plaintext requests when TLS enforcement is disabled (dev mode)', async () => {
      config.tls.enforce = false;

      const res = await request(app)
        .get('/api/health')
        .set('x-forwarded-proto', 'http');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('TC-Sec-01: WebSocket Gateway TLS Enforcement', () => {
    it('TC-Sec-01.5: should reject plaintext WebSocket connection when TLS is enforced', async () => {
      config.tls.enforce = true;

      await new Promise((resolve) => {
        const client = ioClient(`http://127.0.0.1:${serverPort}`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-forwarded-proto': 'http',
          },
          reconnection: false,
        });

        client.on('connect_error', (err) => {
          expect(err.message).toContain('TLS_REQUIRED');
          client.disconnect();
          resolve();
        });

        client.on('connect', () => {
          client.disconnect();
          throw new Error('Plaintext WebSocket connection should have been rejected');
        });
      });
    });

    it('TC-Sec-01.6: should allow secure WebSocket connection when TLS is enforced', async () => {
      config.tls.enforce = true;

      await new Promise((resolve, reject) => {
        const client = ioClient(`http://127.0.0.1:${serverPort}`, {
          transports: ['websocket'],
          extraHeaders: {
            'x-forwarded-proto': 'https',
          },
          auth: { token: 'mock_jwt_token', userId: 'tls_user_1' },
          reconnection: false,
        });

        client.on('connection:ack', (ack) => {
          expect(ack.status).toBe('connected');
          client.disconnect();
          resolve();
        });

        client.on('connect_error', (err) => {
          client.disconnect();
          reject(err);
        });
      });
    });
  });
});
