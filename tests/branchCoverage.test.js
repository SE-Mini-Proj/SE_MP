const { describe, it, expect, beforeEach } = require('@jest/globals');

// ============================================================================
// 1. Sanitizer & XSS Utility Branch Coverage
// ============================================================================
describe('Sanitizer Utilities Branch Coverage', () => {
  const {
    escapeHtml,
    stripDangerousTags,
    sanitizeMessage,
    sanitizeDeep,
    containsUnsafeMarkup,
  } = require('../src/utils/sanitizer');

  it('handles non-string values gracefully', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(123)).toBe('');
    expect(stripDangerousTags(null)).toBe('');
    expect(stripDangerousTags(undefined)).toBe('');
    expect(stripDangerousTags({})).toBe('');
    expect(sanitizeMessage(null)).toBe('');
    expect(sanitizeMessage(undefined)).toBe('');
    expect(sanitizeMessage([])).toBe('');
    expect(containsUnsafeMarkup(null)).toBe(false);
    expect(containsUnsafeMarkup(undefined)).toBe(false);
    expect(containsUnsafeMarkup(42)).toBe(false);
  });

  it('escapes all special HTML characters', () => {
    const raw = '& < > " \' / `';
    const escaped = escapeHtml(raw);
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#x27;');
    expect(escaped).toContain('&#x2F;');
    expect(escaped).toContain('&#96;');
  });

  it('detects unsafe and safe markup', () => {
    expect(containsUnsafeMarkup('Hello world')).toBe(false);
    expect(containsUnsafeMarkup('<script>alert(1)</script>')).toBe(true);
    expect(containsUnsafeMarkup('<img src=x onerror=alert(1)>')).toBe(true);
    expect(containsUnsafeMarkup('<b style="color:red">bold</b>')).toBe(true);
  });

  it('deeply sanitizes complex objects, arrays, and primitive values', () => {
    const input = {
      text: '<script>alert("xss")</script>',
      nested: {
        item: '<img src="x" />',
        count: 5,
        flag: true,
        empty: null,
      },
      list: ['<b>Hello</b>', 10, { inner: '<i>world</i>' }],
    };

    const sanitized = sanitizeDeep(input);
    expect(sanitized.text).toContain('&lt;script&gt;');
    expect(sanitized.nested.item).toContain('&lt;img');
    expect(sanitized.nested.count).toBe(5);
    expect(sanitized.nested.flag).toBe(true);
    expect(sanitized.nested.empty).toBeNull();
    expect(sanitized.list[0]).toContain('&lt;b&gt;');
    expect(sanitized.list[1]).toBe(10);
    expect(sanitized.list[2].inner).toContain('&lt;i&gt;');

    expect(sanitizeDeep(123)).toBe(123);
    expect(sanitizeDeep(null)).toBeNull();
    expect(sanitizeDeep(undefined)).toBeUndefined();
  });
});

// ============================================================================
// 2. Middlewares Branch Coverage (TLS, Error, XSS, RBAC)
// ============================================================================
describe('Middlewares Branch Coverage', () => {
  const { enforceTls } = require('../src/middlewares/tlsMiddleware');
  const { notFoundHandler, errorHandler } = require('../src/middlewares/errorMiddleware');
  const { xssSanitizerMiddleware } = require('../src/middlewares/xssMiddleware');
  const {
    requireRoomRole,
    requirePlatformAdmin,
    setMockRoomRole,
    clearMockRoomRoles,
    getMockRoomRole,
  } = require('../src/middlewares/rbacMiddleware');

  describe('TLS Middleware', () => {
    it('redirects GET and HEAD on insecure connection when enforced', () => {
      const config = require('../src/config');
      const origEnforce = config.tls.enforce;
      try {
        config.tls.enforce = true;

        const reqGet = {
          secure: false,
          headers: { host: 'example.com' },
          method: 'GET',
          originalUrl: '/test',
        };
        const resGet = {
          setHeader: jest.fn(),
          redirect: jest.fn(),
        };
        const next = jest.fn();

        enforceTls(reqGet, resGet, next);
        expect(resGet.setHeader).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          expect.stringContaining('max-age=')
        );
        expect(resGet.redirect).toHaveBeenCalledWith(301, 'https://example.com/test');
        expect(next).not.toHaveBeenCalled();

        const reqHead = {
          secure: false,
          headers: {},
          method: 'HEAD',
          url: '/fallback',
        };
        const resHead = {
          setHeader: jest.fn(),
          redirect: jest.fn(),
        };
        enforceTls(reqHead, resHead, next);
        expect(resHead.redirect).toHaveBeenCalledWith(301, 'https://localhost/fallback');

        const reqPost = {
          secure: false,
          headers: {},
          method: 'POST',
          url: '/api',
        };
        const resPost = {
          setHeader: jest.fn(),
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };
        enforceTls(reqPost, resPost, next);
        expect(resPost.status).toHaveBeenCalledWith(403);
        expect(resPost.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'TLS_REQUIRED' })
        );

        const reqSecure = {
          secure: true,
          headers: { 'x-forwarded-proto': 'https' },
          method: 'GET',
        };
        const resSecure = { setHeader: jest.fn() };
        const nextSecure = jest.fn();
        enforceTls(reqSecure, resSecure, nextSecure);
        expect(nextSecure).toHaveBeenCalled();
      } finally {
        config.tls.enforce = origEnforce;
      }
    });

    it('passes through when TLS enforcement is disabled and connection is not secure', () => {
      const config = require('../src/config');
      const origEnforce = config.tls.enforce;
      try {
        config.tls.enforce = false;
        const req = { secure: false, headers: {} };
        const res = { setHeader: jest.fn() };
        const next = jest.fn();
        enforceTls(req, res, next);
        expect(next).toHaveBeenCalled();
      } finally {
        config.tls.enforce = origEnforce;
      }
    });
  });

  describe('Error Middleware', () => {
    it('handles not found route', () => {
      const req = { method: 'GET', originalUrl: '/unknown' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      notFoundHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        code: 'NOT_FOUND',
        message: 'Resource not found: GET /unknown',
      });
    });

    it('handles entity.too.large error', () => {
      const err = { type: 'entity.too.large' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      errorHandler(err, {}, res);
      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith({
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the configured upload size limit',
      });
    });

    it('handles generic server errors with defaults', () => {
      const err = new Error('Database explode');
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      errorHandler(err, {}, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database explode',
      });
    });

    it('handles custom status and code without message', () => {
      const err = { status: 400, code: 'CUSTOM_ERR' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      errorHandler(err, {}, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: 'CUSTOM_ERR',
        message: 'An unexpected error occurred',
      });
    });
  });

  describe('XSS Middleware', () => {
    it('preserves password and deviceToken while sanitizing rest of body', () => {
      const req = {
        body: {
          username: '<script>alert("u")</script>',
          password: 'Secret<Password>&123',
          deviceToken: 'token:abc<def>',
        },
        query: { q: '<b>search</b>' },
        params: { id: '<i>123</i>' },
      };
      const res = {};
      const next = jest.fn();

      xssSanitizerMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body.username).toContain('&lt;script&gt;');
      expect(req.body.password).toBe('Secret<Password>&123');
      expect(req.body.deviceToken).toBe('token:abc<def>');
      expect(req.query.q).toContain('&lt;b&gt;');
      expect(req.params.id).toContain('&lt;i&gt;');
    });

    it('handles requests without body, query, or params', () => {
      const req = {};
      const next = jest.fn();
      xssSanitizerMiddleware(req, {}, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('RBAC Middleware', () => {
    beforeEach(() => {
      clearMockRoomRoles();
    });

    it('rejects unauthenticated requests', async () => {
      const middleware = requireRoomRole();
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'UNAUTHORIZED' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('bypasses room check for platform administrator', async () => {
      const middleware = requireRoomRole();
      const req = { user: { id: 'admin-1', role: 'admin' } };
      const next = jest.fn();

      await middleware(req, {}, next);
      expect(next).toHaveBeenCalled();
      expect(req.user.isSuperAdmin).toBe(true);
    });

    it('rejects requests with missing roomId', async () => {
      const middleware = requireRoomRole();
      const req = { user: { id: 'user-1' }, params: {}, body: {}, query: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
    });

    it('accepts x-room-role header override', async () => {
      const middleware = requireRoomRole(['owner', 'moderator']);
      const req = {
        user: { id: 'user-1' },
        params: { roomId: 'room-10' },
        headers: { 'x-room-role': 'moderator' },
      };
      const next = jest.fn();

      await middleware(req, {}, next);
      expect(next).toHaveBeenCalled();
      expect(req.user.roomRole).toBe('moderator');
    });

    it('uses mock room roles correctly', async () => {
      setMockRoomRole('room-20', 'user-20', 'owner');
      expect(getMockRoomRole('room-20', 'user-20')).toBe('owner');

      const middleware = requireRoomRole(['owner']);
      const req = {
        user: { id: 'user-20' },
        params: { roomId: 'room-20' },
        headers: {},
      };
      const next = jest.fn();

      await middleware(req, {}, next);
      expect(next).toHaveBeenCalled();
      expect(req.user.roomRole).toBe('owner');
    });

    it('rejects when member role does not match allowed roles', async () => {
      setMockRoomRole('room-30', 'user-30', 'member');
      const middleware = requireRoomRole(['owner', 'moderator']);
      const req = {
        user: { id: 'user-30' },
        params: { roomId: 'room-30' },
        headers: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'FORBIDDEN' })
      );
    });

    it('requirePlatformAdmin checks user role correctly', () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      requirePlatformAdmin({}, res, next);
      expect(res.status).toHaveBeenCalledWith(401);

      requirePlatformAdmin({ user: { id: 'u1', role: 'member' } }, res, next);
      expect(res.status).toHaveBeenCalledWith(403);

      const nextAdmin = jest.fn();
      requirePlatformAdmin({ user: { id: 'u1', role: 'ADMIN' } }, res, nextAdmin);
      expect(nextAdmin).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// 3. Audit Service Branch Coverage
// ============================================================================
describe('Audit Service Branch Coverage', () => {
  const {
    recordAuditLog,
    getAuditLogs,
    clearInMemoryLogs,
  } = require('../src/services/auditService');

  beforeEach(() => {
    clearInMemoryLogs();
  });

  it('validates required audit parameters', async () => {
    await expect(recordAuditLog({})).rejects.toThrow('actorId is required');
    await expect(recordAuditLog({ actorId: 'a1' })).rejects.toThrow('action is required');
    await expect(recordAuditLog({ actorId: 'a1', action: 'BAN' })).rejects.toThrow('targetType is required');
  });

  it('redacts sensitive fields in metadata including nested objects and arrays', async () => {
    const entry = await recordAuditLog({
      actorId: 'admin-1',
      action: 'LOGIN_FAILURE',
      targetType: 'user',
      targetId: 'user-99',
      roomId: 'room-1',
      metadata: {
        password: 'rawPassword',
        token: 'secretJwt',
        nested: {
          apiKey: 'key123',
          normal: 'safeValue',
        },
        items: [{ secret: 'classified' }, 'plain'],
        count: 10,
      },
    });

    expect(entry.metadata.password).toBe('[REDACTED]');
    expect(entry.metadata.token).toBe('[REDACTED]');
    expect(entry.metadata.nested.apiKey).toBe('[REDACTED]');
    expect(entry.metadata.nested.normal).toBe('safeValue');
    expect(entry.metadata.items[0].secret).toBe('[REDACTED]');
    expect(entry.metadata.items[1]).toBe('plain');
    expect(entry.metadata.count).toBe(10);
  });

  it('filters in-memory audit logs by roomId, actorId, and date', async () => {
    await recordAuditLog({
      actorId: 'actor-A',
      action: 'MUTE_USER',
      targetType: 'user',
      roomId: 'room-A',
    });
    await recordAuditLog({
      actorId: 'actor-B',
      action: 'BAN_USER',
      targetType: 'user',
      roomId: 'room-B',
    });

    const logsRoomA = await getAuditLogs({ roomId: 'room-A' });
    expect(logsRoomA.length).toBe(1);
    expect(logsRoomA[0].roomId).toBe('room-A');

    const logsActorB = await getAuditLogs({ actorId: 'actor-B' });
    expect(logsActorB.length).toBe(1);
    expect(logsActorB[0].actorId).toBe('actor-B');

    const futureDate = new Date(Date.now() + 100000).toISOString();
    const pastLogs = await getAuditLogs({ before: futureDate });
    expect(pastLogs.length).toBe(2);

    const veryPastDate = new Date(Date.now() - 100000).toISOString();
    const emptyLogs = await getAuditLogs({ before: veryPastDate });
    expect(emptyLogs.length).toBe(0);
  });
});

// ============================================================================
// 4. Moderation Service & Controller Branch Coverage
// ============================================================================
describe('Moderation Service & Controller Branch Coverage', () => {
  const ModerationService = require('../src/services/moderationService');
  const ModerationController = require('../src/controllers/moderationController');
  const RoomModel = require('../src/models/roomModel');
  const { setMockRoomRole, clearMockRoomRoles } = require('../src/middlewares/rbacMiddleware');

  beforeEach(() => {
    clearMockRoomRoles();
  });

  it('validates required parameters for all moderation actions', async () => {
    await expect(ModerationService.muteUser({})).rejects.toThrow('required');
    await expect(ModerationService.unmuteUser({})).rejects.toThrow('required');
    await expect(ModerationService.banUser({})).rejects.toThrow('required');
    await expect(ModerationService.unbanUser({})).rejects.toThrow('required');
    await expect(ModerationService.deleteMessage({})).rejects.toThrow('required');
    await expect(ModerationService.removeMember({})).rejects.toThrow('required');
  });

  it('protects room owner from being muted, banned, or removed', async () => {
    const origFindById = RoomModel.findById;
    try {
      RoomModel.findById = jest.fn().mockResolvedValue({
        id: 'room-protect',
        ownerId: 'owner-user',
      });

      // Mute owner fails
      await expect(
        ModerationService.muteUser({
          roomId: 'room-protect',
          targetUserId: 'owner-user',
          actorId: 'mod-1',
        })
      ).rejects.toThrow('Cannot mute room owner');

      // Ban owner fails
      await expect(
        ModerationService.banUser({
          roomId: 'room-protect',
          targetUserId: 'owner-user',
          actorId: 'mod-1',
        })
      ).rejects.toThrow('Cannot ban room owner');

      // Remove owner fails via RoomModel check
      await expect(
        ModerationService.removeMember({
          roomId: 'room-protect',
          targetUserId: 'owner-user',
          actorId: 'mod-1',
        })
      ).rejects.toThrow('Cannot remove room owner');

      // Remove owner fails via RBAC mock check
      RoomModel.findById = jest.fn().mockResolvedValue({ id: 'room-protect', ownerId: 'other' });
      setMockRoomRole('room-protect', 'owner-user', 'owner');
      await expect(
        ModerationService.removeMember({
          roomId: 'room-protect',
          targetUserId: 'owner-user',
          actorId: 'mod-1',
        })
      ).rejects.toThrow('Cannot remove room owner');
    } finally {
      RoomModel.findById = origFindById;
    }
  });

  it('successfully executes mute, unmute, ban, unban, deleteMessage, removeMember', async () => {
    const origFindById = RoomModel.findById;
    try {
      RoomModel.findById = jest.fn().mockResolvedValue({ id: 'r1', ownerId: 'diff-owner' });

      const muteRes = await ModerationService.muteUser({
        roomId: 'r1',
        targetUserId: 'u1',
        actorId: 'm1',
        mutedUntil: new Date(),
        reason: 'spam',
      });
      expect(muteRes.success).toBe(true);
      expect(muteRes.muted).toBe(true);

      const unmuteRes = await ModerationService.unmuteUser({
        roomId: 'r1',
        targetUserId: 'u1',
        actorId: 'm1',
      });
      expect(unmuteRes.success).toBe(true);
      expect(unmuteRes.muted).toBe(false);

      const banRes = await ModerationService.banUser({
        roomId: 'r1',
        targetUserId: 'u1',
        actorId: 'm1',
        reason: 'abuse',
      });
      expect(banRes.success).toBe(true);
      expect(banRes.banned).toBe(true);

      const unbanRes = await ModerationService.unbanUser({
        roomId: 'r1',
        targetUserId: 'u1',
        actorId: 'm1',
      });
      expect(unbanRes.success).toBe(true);
      expect(unbanRes.banned).toBe(false);

      const delMsgRes = await ModerationService.deleteMessage({
        roomId: 'r1',
        messageId: 'msg-1',
        actorId: 'm1',
      });
      expect(delMsgRes.success).toBe(true);
      expect(delMsgRes.deleted).toBe(true);

      const remMemRes = await ModerationService.removeMember({
        roomId: 'r1',
        targetUserId: 'u1',
        actorId: 'm1',
      });
      expect(remMemRes.success).toBe(true);
      expect(remMemRes.removed).toBe(true);

      const auditLogs = await ModerationService.getRoomAuditLogs({ roomId: 'r1' });
      expect(Array.isArray(auditLogs)).toBe(true);
    } finally {
      RoomModel.findById = origFindById;
    }
  });

  it('exercises ModerationController routes and error handlers', async () => {
    const reqMute = {
      params: { roomId: 'r1', userId: 'u1' },
      body: { reason: 'spam' },
      user: { id: 'm1' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await ModerationController.muteUser(reqMute, res, next);
    expect(res.status).toHaveBeenCalledWith(200);

    // Controller handles OPERATION_NOT_ALLOWED
    const origMute = ModerationService.muteUser;
    try {
      const err = new Error('Cannot mute room owner');
      err.code = 'OPERATION_NOT_ALLOWED';
      ModerationService.muteUser = jest.fn().mockRejectedValue(err);

      await ModerationController.muteUser(reqMute, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'OPERATION_NOT_ALLOWED' }));

      // Unmute controller
      await ModerationController.unmuteUser(reqMute, res, next);

      // Ban controller handles OPERATION_NOT_ALLOWED
      ModerationService.banUser = jest.fn().mockRejectedValue(err);
      await ModerationController.banUser(reqMute, res, next);
      expect(res.status).toHaveBeenCalledWith(403);

      // Unban controller
      await ModerationController.unbanUser(reqMute, res, next);

      // Delete message controller
      const reqDel = {
        params: { roomId: 'r1', messageId: 'm1' },
        body: {},
        user: { id: 'admin1' },
      };
      await ModerationController.deleteMessage(reqDel, res, next);

      // Remove member controller
      ModerationService.removeMember = jest.fn().mockRejectedValue(err);
      await ModerationController.removeMember(reqMute, res, next);
      expect(res.status).toHaveBeenCalledWith(403);

      // Audit logs controller
      await ModerationController.getAuditLogs({ params: { roomId: 'r1' }, query: {} }, res, next);
    } finally {
      ModerationService.muteUser = origMute;
    }
  });
});

// ============================================================================
// 5. Media Service & Controller Branch Coverage
// ============================================================================
describe('Media Service & Controller Branch Coverage', () => {
  const mediaService = require('../src/services/mediaService');
  const mediaController = require('../src/controllers/mediaController');
  const RoomModel = require('../src/models/roomModel');

  it('validates file upload format, size, and extension', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';

    // Non-buffer or empty
    await expect(
      mediaService.uploadToRoom({
        roomId: validUuid,
        userId: 'u1',
        fileName: 'test.png',
        contentType: 'image/png',
        body: 'not-a-buffer',
      })
    ).rejects.toThrow('A non-empty file is required');

    // Unsupported extension
    await expect(
      mediaService.uploadToRoom({
        roomId: validUuid,
        userId: 'u1',
        fileName: 'malware.exe',
        contentType: 'application/x-msdownload',
        body: Buffer.from('payload'),
      })
    ).rejects.toThrow('Only supported image and document file types');

    // Content-type mismatch
    await expect(
      mediaService.uploadToRoom({
        roomId: validUuid,
        userId: 'u1',
        fileName: 'doc.pdf',
        contentType: 'image/png',
        body: Buffer.from('payload'),
      })
    ).rejects.toThrow('Only supported image and document file types');

    // Invalid roomId format
    await expect(
      mediaService.uploadToRoom({
        roomId: 'invalid-room',
        userId: 'u1',
        fileName: 'img.png',
        contentType: 'image/png',
        body: Buffer.from('payload'),
      })
    ).rejects.toThrow('A valid room ID is required');
  });

  it('validates room membership before upload', async () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const origFindById = RoomModel.findById;
    const origGetRole = RoomModel.getMemberRole;

    try {
      RoomModel.findById = jest.fn().mockResolvedValue(null);
      await expect(
        mediaService.uploadToRoom({
          roomId: validUuid,
          userId: 'u1',
          fileName: 'test.png',
          contentType: 'image/png',
          body: Buffer.from('hello'),
        })
      ).rejects.toThrow('Room not found');

      RoomModel.findById = jest.fn().mockResolvedValue({ id: validUuid });
      RoomModel.getMemberRole = jest.fn().mockResolvedValue(null);
      await expect(
        mediaService.uploadToRoom({
          roomId: validUuid,
          userId: 'u1',
          fileName: 'test.png',
          contentType: 'image/png',
          body: Buffer.from('hello'),
        })
      ).rejects.toThrow('You are not a member of this room');
    } finally {
      RoomModel.findById = origFindById;
      RoomModel.getMemberRole = origGetRole;
    }
  });

  it('exercises media controller error branches', async () => {
    const req = {
      params: { roomId: 'r1' },
      user: { id: 'u1' },
      get: (h) => (h === 'x-file-name' ? '%E0%A4%A' : 'image/png'), // Malformed URI
      body: Buffer.from('data'),
      app: { get: () => null },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await mediaController.uploadRoomMedia(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ============================================================================
// 6. Controllers Branch Coverage (Room, Auth)
// ============================================================================
describe('Controllers Branch Coverage (Room, Auth)', () => {
  const roomController = require('../src/controllers/roomController');
  const authController = require('../src/controllers/authController');

  it('roomController validates required fields', async () => {
    const req = { body: {}, user: { id: 'u1' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    // Missing room name
    await roomController.createRoom(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('authController validates missing credentials', async () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    // Missing registration fields
    await authController.register({ body: { username: 'test' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);

    // Missing login credentials
    await authController.login({ body: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ============================================================================
// 7. Socket Message & Presence Handlers Branch Coverage
// ============================================================================
describe('Socket Handlers Branch Coverage', () => {
  const registerMessageHandler = require('../src/sockets/handlers/messageHandler');
  const registerPresenceHandler = require('../src/sockets/handlers/presenceHandler');

  it('messageHandler handles invalid payload branches', async () => {
    const emittedEvents = [];
    const mockSocket = {
      id: 'socket-123',
      user: { id: 'user-123' },
      on: (event, handler) => {
        if (event === 'message:send') mockSocket.messageHandler = handler;
      },
      emit: (event, payload) => {
        emittedEvents.push({ event, payload });
      },
    };
    const stopTyping = jest.fn();

    registerMessageHandler({}, mockSocket, stopTyping);

    // 1. Empty message text
    const callback1 = jest.fn();
    await mockSocket.messageHandler({ text: '  ' }, callback1);
    expect(callback1).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Object) }));

    // 2. Both roomId and recipientId provided
    const callback2 = jest.fn();
    await mockSocket.messageHandler({ text: 'hi', roomId: 'r1', recipientId: 'u2' }, callback2);
    expect(callback2).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Object) }));

    // 3. Direct message without recipientId
    const callback3 = jest.fn();
    await mockSocket.messageHandler({ text: 'hi' }, callback3);
    expect(callback3).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Object) }));
  });

  it('presenceHandler handles typing and session events', () => {
    const emittedTo = [];
    const mockSocket = {
      id: 'sock-1',
      user: { id: 'u1' },
      to: (room) => ({
        emit: (event, payload) => emittedTo.push({ room, event, payload }),
      }),
      on: (event, handler) => {
        mockSocket[event] = handler;
      },
    };

    const mockIo = {
      to: () => ({ emit: jest.fn() }),
    };

    const stopTyping = registerPresenceHandler(mockIo, mockSocket);
    expect(typeof stopTyping).toBe('function');
    // Call stopTyping with no room or non-existent timer
    stopTyping();
    stopTyping('room-does-not-exist');
  });
});

// ============================================================================
// 8. Models Branch Coverage (AuditLog, DeviceToken, Media, Moderation, Room, Message)
// ============================================================================
describe('Database Models Branch Coverage', () => {
  const AuditLogModel = require('../src/models/auditLogModel');
  const DeviceTokenModel = require('../src/models/deviceTokenModel');
  const UserModel = require('../src/models/userModel');
  const RoomModel = require('../src/models/roomModel');
  const MessageModel = require('../src/models/messageModel');
  const MediaModel = require('../src/models/mediaModel');
  const ModerationModel = require('../src/models/moderationModel');
  const db = require('../src/db');

  it('constructs models with appropriate defaults and toJSON', async () => {
    const audit = new AuditLogModel({
      id: 'a1',
      actor_id: 'act1',
      action: 'BAN',
      target_type: 'user',
      metadata: { reason: 'test' },
    });
    expect(audit.actorId).toBe('act1');
    expect(audit.toJSON().actorId).toBe('act1');

    const user = new UserModel({
      id: 'u1',
      username: 'alice',
      email: 'alice@example.com',
      password_hash: 'hash123',
    });
    expect(user.username).toBe('alice');
    expect(user.toJSON().passwordHash).toBeUndefined();

    // Test deleteInvalid with empty array
    await expect(DeviceTokenModel.deleteInvalid([])).resolves.toBeUndefined();
  });

  it('exercises model query branch edge cases with mocked db queries', async () => {
    const origQuery = db.query;
    try {
      // 1. RoomModel methods
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // findById not found
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'Room 1', is_private: false, owner_id: 'u1' }] }) // findById found
        .mockResolvedValueOnce({ rows: [{ owner_id: 'u1' }] }) // getMemberRole check 1 (is owner)
        .mockResolvedValueOnce({ rows: [{ owner_id: 'other' }] }) // getMemberRole check 2 (room query)
        .mockResolvedValueOnce({ rows: [{ role: 'admin' }] }) // getMemberRole check 2 (member query)
        .mockResolvedValueOnce({ rows: [{ id: 'r1' }] }) // removeMember found
        .mockResolvedValueOnce({ rows: [] }) // removeMember not found
        .mockResolvedValueOnce({ rows: [] }); // findValidInvite not found

      expect(await RoomModel.findById('nonexistent')).toBeNull();
      const room = await RoomModel.findById('r1');
      expect(room.id).toBe('r1');
      expect(await RoomModel.getMemberRole('r1', 'u1')).toBe('owner');
      expect(await RoomModel.getMemberRole('r1', 'u2')).toBe('admin');
      expect(await RoomModel.removeMember({ roomId: 'r1', userId: 'u2' })).toBe(true);
      expect(await RoomModel.removeMember({ roomId: 'r1', userId: 'u3' })).toBe(false);
      expect(await RoomModel.findValidInvite({ roomId: 'r1', inviteCode: 'invalid' })).toBeNull();

      // 2. MessageModel methods
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // findById not found
        .mockResolvedValueOnce({ rows: [{ id: 'm1', content: 'hello', delivered: true }] }) // findById found
        .mockResolvedValueOnce({ rows: [] }) // markDelivered not found
        .mockResolvedValueOnce({ rows: [{ id: 'm1', delivered: true }] }); // markDelivered found

      expect(await MessageModel.findById('nonexistent')).toBeNull();
      expect(await MessageModel.findById('m1')).toBeDefined();
      expect(await MessageModel.markDelivered('nonexistent')).toBeNull();
      expect(await MessageModel.markDelivered('m1')).toBeDefined();

      // 3. MediaModel & ModerationModel methods
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // MediaModel.findById not found
        .mockResolvedValueOnce({ rows: [{ id: 'med-1', file_name: 'a.png' }] }) // MediaModel.findById found
        .mockResolvedValueOnce({ rows: [] }) // ModerationModel.isBanned false
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] }) // ModerationModel.isBanned true
        .mockResolvedValueOnce({ rows: [] }) // ModerationModel.isMuted false
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] }); // ModerationModel.isMuted true

      expect(await MediaModel.findById('none')).toBeNull();
      expect(await MediaModel.findById('med-1')).toBeDefined();
      expect(await ModerationModel.isBanned({ roomId: 'r1', userId: 'u1' })).toBe(false);
      expect(await ModerationModel.isBanned({ roomId: 'r1', userId: 'u2' })).toBe(true);
      expect(await ModerationModel.isMuted({ roomId: 'r1', userId: 'u1' })).toBe(false);
      expect(await ModerationModel.isMuted({ roomId: 'r1', userId: 'u2' })).toBe(true);

      // 4. UserModel methods
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // findById not found
        .mockResolvedValueOnce({ rows: [{ id: 'u1', username: 'alice', email: 'alice@example.com' }] }) // findById found
        .mockResolvedValueOnce({ rows: [] }) // findByEmail not found
        .mockResolvedValueOnce({ rows: [{ id: 'u1', username: 'alice', email: 'alice@example.com' }] }) // findByEmail found
        .mockResolvedValueOnce({ rows: [] }) // findByUsername not found
        .mockResolvedValueOnce({ rows: [{ id: 'u1', username: 'alice', email: 'alice@example.com' }] }); // findByUsername found

      expect(await UserModel.findById('u99')).toBeNull();
      expect(await UserModel.findById('u1')).toBeDefined();
      expect(await UserModel.findByEmail('none@example.com')).toBeNull();
      expect(await UserModel.findByEmail('alice@example.com')).toBeDefined();
      expect(await UserModel.findByUsername('none')).toBeNull();
      expect(await UserModel.findByUsername('alice')).toBeDefined();
    } finally {
      db.query = origQuery;
    }
  });
});

// ============================================================================
// 9. Lockout Service Branch Coverage
// ============================================================================
describe('Lockout Service Branch Coverage', () => {
  const lockoutService = require('../src/services/lockoutService');

  beforeEach(() => {
    lockoutService.clearAllLockouts();
  });

  it('handles null and undefined identifiers safely', () => {
    expect(() => lockoutService.checkLockout(null)).not.toThrow();
    expect(() => lockoutService.checkLockout('')).not.toThrow();
    expect(() => lockoutService.recordFailedAttempt(null)).not.toThrow();
    expect(() => lockoutService.resetFailedAttempts(null)).not.toThrow();
    expect(lockoutService.getLockoutStatus(null)).toEqual({
      isLocked: false,
      failedAttempts: 0,
      remainingSeconds: 0,
    });
  });

  it('increments failed attempts and triggers lockout at 5 failures', () => {
    const user = 'locked_user@example.com';
    for (let i = 1; i <= 4; i++) {
      lockoutService.recordFailedAttempt(user);
      const status = lockoutService.getLockoutStatus(user);
      expect(status.isLocked).toBe(false);
      expect(status.failedAttempts).toBe(i);
      expect(() => lockoutService.checkLockout(user)).not.toThrow();
    }

    // 5th attempt locks the account
    lockoutService.recordFailedAttempt(user);
    const lockedStatus = lockoutService.getLockoutStatus(user);
    expect(lockedStatus.isLocked).toBe(true);
    expect(lockedStatus.failedAttempts).toBe(5);
    expect(lockedStatus.remainingSeconds).toBeGreaterThan(0);

    // checkLockout should throw 429
    expect(() => lockoutService.checkLockout(user)).toThrow(
      'Too many attempts. Account is locked. Please try again after 5 minutes.'
    );

    // Resetting clears the lock
    lockoutService.resetFailedAttempts(user);
    expect(lockoutService.getLockoutStatus(user).isLocked).toBe(false);
  });
});

// ============================================================================
// 10. Object Storage Service Branch Coverage
// ============================================================================
describe('Object Storage Service Branch Coverage', () => {
  const objectStorageService = require('../src/services/objectStorageService');
  const config = require('../src/config');
  const http = require('node:http');

  it('validates missing configuration and throws appropriate errors', async () => {
    const origConfig = { ...config.objectStorage };
    try {
      // Missing bucket
      config.objectStorage = { ...origConfig, bucket: '' };
      await expect(
        objectStorageService.putObject({ key: 'test', body: Buffer.from('x') })
      ).rejects.toThrow('Object storage is not configured');

      // Missing credentials
      config.objectStorage = { ...origConfig, bucket: 'my-bucket', accessKeyId: '', secretAccessKey: '' };
      await expect(
        objectStorageService.putObject({ key: 'test', body: Buffer.from('x') })
      ).rejects.toThrow('Object storage credentials are not configured');

      // Invalid endpoint URL
      config.objectStorage = {
        ...origConfig,
        bucket: 'my-bucket',
        accessKeyId: 'key',
        secretAccessKey: 'sec',
        endpoint: 'ftp://invalid-url',
      };
      await expect(
        objectStorageService.putObject({ key: 'test', body: Buffer.from('x') })
      ).rejects.toThrow('Object storage endpoint must be an HTTP(S) URL');
    } finally {
      config.objectStorage = origConfig;
    }
  });

  it('exercises sendRequest with mocked HTTP transport', async () => {
    const origConfig = { ...config.objectStorage };
    const { EventEmitter } = require('node:events');
    const reqSpy = jest.spyOn(http, 'request');

    try {
      config.objectStorage = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'http://storage.local:9000',
        forcePathStyle: true,
        sessionToken: 'sess-tok',
      };

      // Successful request mock
      reqSpy.mockImplementation((url, options, callback) => {
        const clientReq = new EventEmitter();
        clientReq.end = jest.fn();
        const pathname = typeof url === 'string' ? url : url.pathname || '';
        if (pathname.includes('404')) {
          process.nextTick(() => {
            const res = new EventEmitter();
            res.statusCode = 404;
            res.resume = jest.fn();
            callback(res);
          });
        } else {
          process.nextTick(() => {
            const res = new EventEmitter();
            res.statusCode = 200;
            res.resume = jest.fn();
            callback(res);
          });
        }
        return clientReq;
      });

      // PUT
      await expect(
        objectStorageService.putObject({ key: 'files/test.txt', body: Buffer.from('hello'), contentType: 'text/plain' })
      ).resolves.toBeUndefined();

      // GET
      const stream = await objectStorageService.getObject({ key: 'files/test.txt' });
      expect(stream).toBeDefined();

      // DELETE
      await expect(
        objectStorageService.deleteObject({ key: 'files/test.txt' })
      ).resolves.toBeUndefined();

      // Error response (HTTP 404)
      await expect(
        objectStorageService.getObject({ key: 'files/404.txt' })
      ).rejects.toThrow('Object storage returned HTTP 404');

      // Request error event branch
      reqSpy.mockImplementation(() => {
        const clientReq = new EventEmitter();
        clientReq.end = jest.fn();
        process.nextTick(() => {
          clientReq.emit('error', new Error('Network failure'));
        });
        return clientReq;
      });

      await expect(
        objectStorageService.getObject({ key: 'files/fail.txt' })
      ).rejects.toThrow('Object storage request failed');
    } finally {
      reqSpy.mockRestore();
      config.objectStorage = origConfig;
    }
  });
});

// ============================================================================
// 11. Notification Controller Branch Coverage
// ============================================================================
describe('Notification Controller Branch Coverage', () => {
  const notificationController = require('../src/controllers/notificationController');
  const pushNotificationService = require('../src/services/pushNotificationService');

  it('handles device registration and unregistration success and error flows', async () => {
    const origReg = pushNotificationService.registerDevice;
    const origUnreg = pushNotificationService.unregisterDevice;
    try {
      pushNotificationService.registerDevice = jest.fn().mockResolvedValue(true);
      pushNotificationService.unregisterDevice = jest.fn().mockResolvedValue(true);

      const req = { user: { id: 'u1' }, body: { deviceToken: 'tok123' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await notificationController.registerDevice(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);

      await notificationController.unregisterDevice(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);

      // Error forwarding
      const testErr = new Error('Push service failed');
      pushNotificationService.registerDevice = jest.fn().mockRejectedValue(testErr);
      await notificationController.registerDevice(req, res, next);
      expect(next).toHaveBeenCalledWith(testErr);

      pushNotificationService.unregisterDevice = jest.fn().mockRejectedValue(testErr);
      await notificationController.unregisterDevice(req, res, next);
      expect(next).toHaveBeenCalledWith(testErr);
    } finally {
      pushNotificationService.registerDevice = origReg;
      pushNotificationService.unregisterDevice = origUnreg;
    }
  });
});

// ============================================================================
// 12. Redis Client & Presence Cache Branch Coverage
// ============================================================================
describe('Redis Client & Presence Cache Branch Coverage', () => {
  const { getRedisClient, closeRedis, checkRedisConnection } = require('../src/cache/redisClient');
  const presenceService = require('../src/cache/presenceService');

  it('exercises redis client getters and health check branches', async () => {
    const client = getRedisClient();
    expect(client).toBeDefined();

    // Health check returns unhealthy when not connected
    const health = await checkRedisConnection();
    expect(health.connected).toBe(false);

    // Verify presenceService throws when redis is not ready
    await expect(presenceService.getOnlineUsers()).rejects.toThrow('Redis is not ready');

    // Close redis handles uninitialized or closed clients gracefully
    await expect(closeRedis()).resolves.toBeUndefined();
  });
});

// ============================================================================
// 13. Message History Service Branch Coverage
// ============================================================================
describe('Message History Service Branch Coverage', () => {
  const messageHistoryService = require('../src/services/messageHistoryService');
  const RoomModel = require('../src/models/roomModel');
  const MessageModel = require('../src/models/messageModel');

  it('validates required parameters and membership', async () => {
    await expect(messageHistoryService.getRoomMessageHistory({})).rejects.toThrow('Room ID and user ID are required');

    const origFindById = RoomModel.findById;
    const origGetMemberRole = RoomModel.getMemberRole;
    try {
      RoomModel.findById = jest.fn().mockResolvedValue(null);
      await expect(
        messageHistoryService.getRoomMessageHistory({ roomId: 'r1', userId: 'u1' })
      ).rejects.toThrow('Room not found');

      RoomModel.findById = jest.fn().mockResolvedValue({ id: 'r1' });
      RoomModel.getMemberRole = jest.fn().mockResolvedValue(null);
      await expect(
        messageHistoryService.getRoomMessageHistory({ roomId: 'r1', userId: 'u1' })
      ).rejects.toThrow('You are not a member of this room');
    } finally {
      RoomModel.findById = origFindById;
      RoomModel.getMemberRole = origGetMemberRole;
    }
  });

  it('validates limit and cursor boundaries', async () => {
    const origFindById = RoomModel.findById;
    const origGetMemberRole = RoomModel.getMemberRole;
    try {
      RoomModel.findById = jest.fn().mockResolvedValue({ id: 'r1' });
      RoomModel.getMemberRole = jest.fn().mockResolvedValue('member');

      // Invalid limit
      await expect(
        messageHistoryService.getRoomMessageHistory({ roomId: 'r1', userId: 'u1', limit: 0 })
      ).rejects.toThrow('Limit must be an integer between 1 and 100');

      await expect(
        messageHistoryService.getRoomMessageHistory({ roomId: 'r1', userId: 'u1', limit: 150 })
      ).rejects.toThrow('Limit must be an integer between 1 and 100');

      // Invalid cursor
      await expect(
        messageHistoryService.getRoomMessageHistory({ roomId: 'r1', userId: 'u1', before: 'invalid-base64!' })
      ).rejects.toThrow('Before must be a valid pagination cursor');
    } finally {
      RoomModel.findById = origFindById;
      RoomModel.getMemberRole = origGetMemberRole;
    }
  });

  it('correctly handles pagination and nextCursor when hasMore is true or false', async () => {
    const origFindById = RoomModel.findById;
    const origGetMemberRole = RoomModel.getMemberRole;
    const origFindByRoomId = MessageModel.findByRoomId;
    try {
      RoomModel.findById = jest.fn().mockResolvedValue({ id: 'r1' });
      RoomModel.getMemberRole = jest.fn().mockResolvedValue('member');

      // Case 1: hasMore = false
      MessageModel.findByRoomId = jest.fn().mockResolvedValue([
        { id: '11111111-1111-4111-8111-111111111111', createdAt: new Date().toISOString() },
      ]);
      const res1 = await messageHistoryService.getRoomMessageHistory({
        roomId: 'r1',
        userId: 'u1',
        limit: 10,
      });
      expect(res1.pagination.hasMore).toBe(false);
      expect(res1.pagination.nextCursor).toBeNull();

      // Case 2: hasMore = true (returns limit + 1 items)
      const now = new Date().toISOString();
      MessageModel.findByRoomId = jest.fn().mockResolvedValue([
        { id: '11111111-1111-4111-8111-111111111111', createdAt: now },
        { id: '22222222-2222-4222-8222-222222222222', createdAt: now },
      ]);
      const res2 = await messageHistoryService.getRoomMessageHistory({
        roomId: 'r1',
        userId: 'u1',
        limit: 1,
      });
      expect(res2.pagination.hasMore).toBe(true);
      expect(typeof res2.pagination.nextCursor).toBe('string');
    } finally {
      RoomModel.findById = origFindById;
      RoomModel.getMemberRole = origGetMemberRole;
      MessageModel.findByRoomId = origFindByRoomId;
    }
  });
});

// ============================================================================
// 14. Auth Middleware Branch Coverage
// ============================================================================
describe('Auth Middleware Branch Coverage', () => {
  const { authenticateJWT } = require('../src/middlewares/authMiddleware');
  const { generateToken } = require('../src/services/authService');

  it('rejects missing or malformed Authorization headers', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    // Missing header
    authenticateJWT({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));

    // Malformed header (not Bearer)
    authenticateJWT({ headers: { authorization: 'Basic 12345' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN_FORMAT' }));

    // Invalid JWT token
    authenticateJWT({ headers: { authorization: 'Bearer invalid.token.value' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('authenticates valid token and attaches user to request', () => {
    const { token } = generateToken({ id: 'user-auth-1', email: 'test@example.com', role: 'admin' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    authenticateJWT(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe('user-auth-1');
    expect(req.user.email).toBe('test@example.com');
    expect(req.user.role).toBe('admin');

    // Token with no role defaults to 'member'
    const tokenNoRole = generateToken({ id: 'user-no-role', email: 'norole@example.com' });
    const reqNoRole = { headers: { authorization: `Bearer ${tokenNoRole.token}` } };
    const nextNoRole = jest.fn();
    authenticateJWT(reqNoRole, res, nextNoRole);
    expect(nextNoRole).toHaveBeenCalled();
    expect(reqNoRole.user.role).toBe('member');
  });
});

// ============================================================================
// 15. Socket Handlers Full Delivery Branches
// ============================================================================
describe('Socket Handlers Delivery Branch Coverage', () => {
  const registerMessageHandler = require('../src/sockets/handlers/messageHandler');
  const registerPresenceHandler = require('../src/sockets/handlers/presenceHandler');
  const messagingService = require('../src/services/messagingService');

  it('delivers direct message to online recipient and offline recipient', async () => {
    const emittedEvents = [];
    const mockSocket = {
      id: 'sock-test-1',
      user: { id: 'sender-1' },
      on: (event, handler) => {
        mockSocket[event] = handler;
      },
      emit: (event, payload) => emittedEvents.push({ event, payload }),
    };

    const mockIo = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };

    registerMessageHandler(mockIo, mockSocket);

    // Online recipient delivery
    const origProcessMessage = messagingService.processMessage;
    const origMarkDelivered = messagingService.markMessageDelivered;
    const { getPublisherClient, getRedisClient } = require('../src/cache/redisClient');
    const pub = getPublisherClient();
    const redis = getRedisClient();
    const origReady = pub.isReady;
    const origPub = pub.publish;
    const origRedisReady = redis.isReady;
    const origRPush = redis.rPush;
    const origSMembers = redis.sMembers;
    const origGet = redis.get;
    const origSAdd = redis.sAdd;

    try {
      Object.defineProperty(pub, 'isReady', { value: true, configurable: true, writable: true });
      Object.defineProperty(pub, 'isOpen', { value: true, configurable: true, writable: true });
      pub.publish = jest.fn().mockResolvedValue(1);
      Object.defineProperty(redis, 'isReady', { value: true, configurable: true, writable: true });
      Object.defineProperty(redis, 'isOpen', { value: true, configurable: true, writable: true });
      redis.rPush = jest.fn().mockResolvedValue(1);
      redis.sAdd = jest.fn().mockResolvedValue(1);
      redis.sMembers = jest.fn().mockResolvedValue(['sock-1']);
      redis.get = jest.fn().mockResolvedValue(JSON.stringify({ socketId: 'sock-1' }));

      messagingService.processMessage = jest.fn().mockResolvedValue({
        messageId: 'msg-uuid-1',
        recipientId: 'recipient-1',
        text: 'hello online',
      });
      messagingService.markMessageDelivered = jest.fn().mockResolvedValue(true);

      const callback = jest.fn();
      await mockSocket['message:send']({ recipientId: 'recipient-1', text: 'hello' }, callback);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));

      // Offline recipient delivery: empty sessions means offline
      redis.sMembers = jest.fn().mockResolvedValue([]);
      redis.del = jest.fn().mockResolvedValue(1);
      redis.sRem = jest.fn().mockResolvedValue(1);

      const callbackOffline = jest.fn();
      await mockSocket['message:send']({ recipientId: 'recipient-offline', text: 'hello' }, callbackOffline);
      expect(callbackOffline).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued' }));

      // Room message delivery
      const callbackRoom = jest.fn();
      await mockSocket['message:send']({ roomId: 'room-1', text: 'hello room' }, callbackRoom);
      expect(callbackRoom).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
    } finally {
      messagingService.processMessage = origProcessMessage;
      messagingService.markMessageDelivered = origMarkDelivered;
      Object.defineProperty(pub, 'isReady', { value: origReady, configurable: true, writable: true });
      pub.publish = origPub;
      Object.defineProperty(redis, 'isReady', { value: origRedisReady, configurable: true, writable: true });
      redis.rPush = origRPush;
      redis.sMembers = origSMembers;
      redis.get = origGet;
      redis.sAdd = origSAdd;
    }
  });

  it('presenceHandler processes room:join, room:leave, and typing events', async () => {
    const joinedRooms = new Set();
    const mockSocket = {
      id: 'presence-sock-1',
      user: { id: 'u1' },
      rooms: joinedRooms,
      join: (r) => joinedRooms.add(r),
      leave: (r) => joinedRooms.delete(r),
      to: () => ({ emit: jest.fn() }),
      on: (event, handler) => {
        mockSocket[event] = handler;
      },
    };

    const mockIo = {
      to: () => ({ emit: jest.fn() }),
    };

    registerPresenceHandler(mockIo, mockSocket);

    // room:join without roomId
    const cbMissingJoin = jest.fn();
    await mockSocket['room:join']({}, cbMissingJoin);
    expect(cbMissingJoin).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Object) }));

    // room:join with valid roomId
    const cbValidJoin = jest.fn();
    await mockSocket['room:join']({ roomId: 'room-abc' }, cbValidJoin);
    expect(cbValidJoin).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));

    // typing:start in joined room
    mockSocket['typing:start']({ roomId: 'room-abc' });

    // typing:start without roomId
    mockSocket['typing:start']({});

    // typing:stop
    mockSocket['typing:stop']({ roomId: 'room-abc' });

    // room:leave without roomId
    const cbMissingLeave = jest.fn();
    await mockSocket['room:leave']({}, cbMissingLeave);
    expect(cbMissingLeave).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Object) }));

    // room:leave with valid roomId
    const cbValidLeave = jest.fn();
    await mockSocket['room:leave']({ roomId: 'room-abc' }, cbValidLeave);
    expect(cbValidLeave).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));

    // disconnecting and disconnect events
    mockSocket['disconnecting']();
    await mockSocket['disconnect']('transport close');
  });
});

// ============================================================================
// 16. Redis Pub/Sub Branch Coverage
// ============================================================================
describe('Redis Pub/Sub Branch Coverage', () => {
  const { initializePubSub } = require('../src/cache/redisPubSub');

  it('validates event handler function argument', async () => {
    await expect(initializePubSub(null)).rejects.toThrow('A Pub/Sub event handler function is required');
    await expect(initializePubSub(123)).rejects.toThrow('A Pub/Sub event handler function is required');
  });
});

// ============================================================================
// 19. Additional Services & Middleware Branch Boosters (75%+ Enforcer)
// ============================================================================
describe('Additional Branch Boosters for Presence, Messaging, and Redis', () => {
  const presenceService = require('../src/cache/presenceService');
  const messagingService = require('../src/services/messagingService');
  const { getRedisClient, getPublisherClient } = require('../src/cache/redisClient');
  const { publishMessage, publishRoomEvent, publishPresenceEvent } = require('../src/cache/redisPubSub');
  const { requestLogger } = require('../src/middlewares/loggerMiddleware');
  const MessageModel = require('../src/models/messageModel');

  it('presenceService exercises session lifecycle, parsing fallbacks, and user status', async () => {
    const redis = getRedisClient();
    Object.defineProperty(redis, 'isReady', { value: true, configurable: true, writable: true });
    Object.defineProperty(redis, 'isOpen', { value: true, configurable: true, writable: true });

    // 1. getUserSessions with corrupted session data (JSON parse error branch)
    redis.sMembers = jest.fn().mockResolvedValue(['sock-corrupt', 'sock-missing']);
    redis.get = jest.fn()
      .mockResolvedValueOnce('invalid json{')
      .mockResolvedValueOnce(null);
    redis.del = jest.fn().mockResolvedValue(1);
    redis.sRem = jest.fn().mockResolvedValue(1);

    const emptySessions = await presenceService.getUserSessions('user-corrupt');
    expect(emptySessions).toEqual([]);

    // 2. registerSession (first session vs second session)
    redis.multi = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      sAdd: jest.fn().mockReturnThis(),
      sCard: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(['OK', 1, 1, 1]), // count is 1 (first session)
    });
    const regRes1 = await presenceService.registerSession({ userId: 'u-reg', socketId: 's-1', instanceId: 'inst-1' });
    expect(regRes1.isFirstSession).toBe(true);

    // 3. removeSession when no sessions remain (cleans up online user index)
    redis.multi = jest.fn().mockReturnValue({
      del: jest.fn().mockReturnThis(),
      sRem: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([1, 1]),
    });
    redis.sMembers = jest.fn().mockResolvedValue([]);
    const removeRes = await presenceService.removeSession({ userId: 'u-reg', socketId: 's-1' });
    expect(removeRes.userOnline).toBe(false);

    // 4. getOnlineUsers with filtering
    redis.sMembers = jest.fn()
      .mockResolvedValueOnce(['u-online', 'u-offline']) // online user ids
      .mockResolvedValueOnce(['s-active']) // u-online has active session
      .mockResolvedValueOnce([]); // u-offline has 0 sessions
    redis.get = jest.fn().mockResolvedValue(JSON.stringify({ socketId: 's-active' }));
    redis.sAdd = jest.fn().mockResolvedValue(1);

    const onlineList = await presenceService.getOnlineUsers();
    expect(onlineList).toContain('u-online');
    expect(onlineList).not.toContain('u-offline');
  });

  it('messagingService fallback branches when database throws', async () => {
    const origCreate = MessageModel.create;
    const origMark = MessageModel.markDelivered;
    const origFind = MessageModel.findById;

    try {
      // 1. processMessage falls back to in-memory store on DB failure
      MessageModel.create = jest.fn().mockRejectedValue(new Error('DB down'));
      const msg = await messagingService.processMessage({
        text: 'offline persistence test',
        senderId: 'u-fallback',
        clientMsgId: 'client-123',
      });
      expect(msg.text).toBe('offline persistence test');
      expect(msg.clientMsgId).toBe('client-123');

      // 2. markMessageDelivered falls back to in-memory store
      MessageModel.markDelivered = jest.fn().mockRejectedValue(new Error('DB down'));
      const marked = await messagingService.markMessageDelivered(msg.id);
      expect(marked.delivered).toBe(true);

      // Null messageId
      expect(await messagingService.markMessageDelivered(null)).toBeNull();
      // Nonexistent fallback
      expect(await messagingService.markMessageDelivered('nonexistent-id')).toBeNull();

      // 3. getMessageById falls back to in-memory store
      MessageModel.findById = jest.fn().mockRejectedValue(new Error('DB down'));
      const found = await messagingService.getMessageById(msg.id);
      expect(found).toBeDefined();

      expect(await messagingService.getMessageById(null)).toBeNull();
      expect(await messagingService.getMessageById('nonexistent-id')).toBeNull();
    } finally {
      MessageModel.create = origCreate;
      MessageModel.markDelivered = origMark;
      MessageModel.findById = origFind;
    }
  });

  it('redisClient reconnectStrategy delay calculations and MAX_RETRIES', () => {
    // Access reconnectStrategy from client options
    const client = getRedisClient();
    const reconnectStrategy = client.options?.socket?.reconnectStrategy;
    expect(typeof reconnectStrategy).toBe('function');

    // Attempt 1 -> 500ms
    expect(reconnectStrategy(1)).toBe(500);
    // Attempt 3 -> 2000ms
    expect(reconnectStrategy(3)).toBe(2000);
    // Attempt 10 -> capped at 5000ms
    expect(reconnectStrategy(10)).toBe(5000);
    // Attempt 11 -> exceeds MAX_RETRIES (10), returns Error
    expect(reconnectStrategy(11)).toBeInstanceOf(Error);
  });

  it('redisPubSub publishMessage, publishRoomEvent, publishPresenceEvent when publisher is ready', async () => {
    const pub = getPublisherClient();
    Object.defineProperty(pub, 'isReady', { value: true, configurable: true, writable: true });
    pub.publish = jest.fn().mockResolvedValue(1);

    await expect(publishMessage({ text: 'hi' })).resolves.toBeUndefined();
    await expect(publishRoomEvent({ eventName: 'e', payload: {} })).resolves.toBeUndefined();
    await expect(publishPresenceEvent({ eventName: 'p', payload: {} })).resolves.toBeUndefined();
  });

  it('loggerMiddleware finish callback with url fallback and non-test log', () => {
    let finishCb;
    const req = {
      method: 'GET',
      url: '/fallback-url',
      ip: '127.0.0.1',
    };
    const res = {
      statusCode: 200,
      on: (event, cb) => {
        if (event === 'finish') finishCb = cb;
      },
    };
    const next = jest.fn();

    requestLogger(req, res, next);
    expect(next).toHaveBeenCalled();

    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      expect(() => finishCb()).not.toThrow();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

describe('Socket Gateway Branch Coverage', () => {
  const http = require('node:http');
  const { initializeSocket } = require('../src/sockets');
  const { generateToken } = require('../src/services/authService');
  const { CHANNELS } = require('../src/cache/redisPubSub');
  const config = require('../src/config');

  it('exercises socket handshake auth and TLS middleware branches', () => {
    const server = http.createServer();
    const { io } = initializeSocket(server);
    // Retrieve the registered io.use auth middleware
    const authMiddleware = io.of('/')._fns[0];

    // 1. Insecure when TLS is enforced
    const origEnforce = config.tls.enforce;
    try {
      config.tls.enforce = true;
      const insecureSocket = { handshake: { secure: false, headers: {} } };
      const nextTls = jest.fn();
      authMiddleware(insecureSocket, nextTls);
      expect(nextTls).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'TLS_REQUIRED' } }));
    } finally {
      config.tls.enforce = origEnforce;
    }

    // 2. Missing authentication token
    const emptySocket = { handshake: { secure: true, auth: {}, headers: {} } };
    const nextEmpty = jest.fn();
    authMiddleware(emptySocket, nextEmpty);
    expect(nextEmpty).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'AUTH_REQUIRED' } }));

    // 3. Invalid token (verifyToken throws)
    const invalidSocket = { handshake: { secure: true, auth: { token: 'invalid.token' }, headers: {} } };
    const nextInvalid = jest.fn();
    authMiddleware(invalidSocket, nextInvalid);
    expect(nextInvalid).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'INVALID_TOKEN' } }));

    // 4. Valid token in auth.token or Authorization Bearer header
    const { token } = generateToken({ id: 'user-valid-1', email: 'v@example.com' });
    const validSocket = { handshake: { secure: true, headers: { authorization: `Bearer ${token}` } } };
    const nextValid = jest.fn();
    authMiddleware(validSocket, nextValid);
    expect(nextValid).toHaveBeenCalledWith();
    expect(validSocket.user.id).toBe('user-valid-1');
    expect(validSocket.authToken).toBe(token);
  });

  it('exercises handleRedisEvent for MESSAGES, ROOM_EVENTS, and PRESENCE', async () => {
    const server = http.createServer();
    const { handleRedisEvent } = initializeSocket(server);

    // Redis Pub/Sub instance ID match (ignore self events)
    const { INSTANCE_ID } = require('../src/cache/redisPubSub');
    await handleRedisEvent(CHANNELS.MESSAGES, { originInstanceId: INSTANCE_ID });

    // Room message from other instance
    await handleRedisEvent(CHANNELS.MESSAGES, {
      originInstanceId: 'other-instance',
      roomId: 'room-1',
      text: 'hello',
    });

    // Direct message from other instance
    await handleRedisEvent(CHANNELS.MESSAGES, {
      originInstanceId: 'other-instance',
      recipientId: 'recipient-1',
      text: 'direct',
    });

    // Message without room or recipient (dropped)
    await handleRedisEvent(CHANNELS.MESSAGES, {
      originInstanceId: 'other-instance',
      text: 'nowhere',
    });

    // Room event with empty payload (ignored)
    await handleRedisEvent(CHANNELS.ROOM_EVENTS, {});

    // Room event with roomId and userId
    await handleRedisEvent(CHANNELS.ROOM_EVENTS, {
      eventName: 'room:update',
      roomId: 'room-1',
      payload: { userId: 'u1' },
    });

    // Member removed event triggering socket eviction
    await handleRedisEvent(CHANNELS.ROOM_EVENTS, {
      eventName: 'member:removed',
      roomId: 'room-1',
      payload: { userId: 'u1' },
    });

    // Presence event with empty payload
    await handleRedisEvent(CHANNELS.PRESENCE, {});

    // Presence event with valid payload
    await handleRedisEvent(CHANNELS.PRESENCE, {
      eventName: 'user:online',
      payload: { userId: 'u1' },
    });
  });
});


