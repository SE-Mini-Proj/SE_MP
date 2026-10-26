const { describe, it, expect, beforeEach } = require('@jest/globals');
const request = require('supertest');
const app = require('../src/app');
const AuditLogModel = require('../src/models/auditLogModel');
const {
  recordAuditLog,
  getAuditLogs,
  sanitizeAuditMetadata,
  clearInMemoryLogs,
} = require('../src/services/auditService');
const ModerationService = require('../src/services/moderationService');
const { generateToken } = require('../src/services/authService');
const {
  ROLES,
  setMockRoomRole,
  clearMockRoomRoles,
} = require('../src/middlewares/rbacMiddleware');

describe('Security Requirement: RBAC & Audit Logging for Moderation Actions (Issue #10 - CHAT-SR-005, TC-Sec-05)', () => {
  const roomId = 'room_engineering_uuid';
  const ownerId = 'user_owner_uuid';
  const moderatorId = 'user_moderator_uuid';
  const memberId = 'user_regular_member_uuid';
  const targetMemberId = 'user_bad_actor_uuid';
  const messageId = 'msg_spam_12345';

  const validToken = (userId, role) => generateToken({ id: userId, role }).token;

  beforeEach(() => {
    clearInMemoryLogs();
    clearMockRoomRoles();

    // Register room roles in the mock RBAC table
    setMockRoomRole(roomId, ownerId, ROLES.OWNER);
    setMockRoomRole(roomId, moderatorId, ROLES.MODERATOR);
    setMockRoomRole(roomId, memberId, ROLES.MEMBER);
    setMockRoomRole(roomId, targetMemberId, ROLES.MEMBER);
  });

  describe('TC-Sec-05.1: RBAC Enforcement - Non-Privileged Access Denied (HTTP 403 Forbidden)', () => {
    it('should reject unauthenticated requests with HTTP 401 Unauthorized', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/mute`)
        .send({ reason: 'spam' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should deny non-privileged members (HTTP 403 Forbidden) from muting a user', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/mute`)
        .set('Authorization', `Bearer ${validToken(memberId)}`)
        .send({ reason: 'trying to mute without permission' });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
      expect(res.body.message).toMatch(/insufficient permissions/i);
    });

    it('should deny non-privileged members (HTTP 403 Forbidden) from banning a user', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/ban`)
        .set('Authorization', `Bearer ${validToken(memberId)}`)
        .send({ reason: 'unauthorized ban attempt' });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should deny non-privileged members (HTTP 403 Forbidden) from unbanning a user', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/unban`)
        .set('Authorization', `Bearer ${validToken(memberId)}`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should deny non-privileged members (HTTP 403 Forbidden) from deleting messages', async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${validToken(memberId)}`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should deny non-privileged members (HTTP 403 Forbidden) from removing members', async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomId}/members/${targetMemberId}`)
        .set('Authorization', `Bearer ${validToken(memberId)}`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should deny non-privileged members (HTTP 403 Forbidden) from viewing audit logs', async () => {
      const res = await request(app)
        .get(`/api/rooms/${roomId}/audit-logs`)
        .set('Authorization', `Bearer ${validToken(memberId)}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    });
  });

  describe('TC-Sec-05.2: Authorized Privileged Operations - Room Owner & Moderator Access', () => {
    it('should allow room owner to mute a user and record audit log', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/mute`)
        .set('Authorization', `Bearer ${validToken(ownerId)}`)
        .send({ reason: 'Repeated offensive remarks' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.muted).toBe(true);
      expect(res.body.userId).toBe(targetMemberId);
      expect(res.body).toHaveProperty('auditLogId');

      // Verify audit log
      const logs = await getAuditLogs({ roomId });
      expect(logs.length).toBeGreaterThan(0);
      const muteLog = logs.find((l) => l.action === 'MUTE_USER');
      expect(muteLog).toBeDefined();
      expect(muteLog.actorId).toBe(ownerId);
      expect(muteLog.targetId).toBe(targetMemberId);
    });

    it('should allow room moderator to mute and unmute a user with audit trails', async () => {
      // Mute by moderator
      const muteRes = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/mute`)
        .set('Authorization', `Bearer ${validToken(moderatorId)}`)
        .send({ reason: 'Disruptive behavior' });

      expect(muteRes.status).toBe(200);
      expect(muteRes.body.muted).toBe(true);

      // Unmute by moderator
      const unmuteRes = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/unmute`)
        .set('Authorization', `Bearer ${validToken(moderatorId)}`)
        .send({ reason: 'Time-out completed' });

      expect(unmuteRes.status).toBe(200);
      expect(unmuteRes.body.muted).toBe(false);

      const logs = await getAuditLogs({ roomId });
      const actions = logs.map((l) => l.action);
      expect(actions).toContain('MUTE_USER');
      expect(actions).toContain('UNMUTE_USER');
    });

    it('should allow room owner to ban a user and verify audit log record', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/ban`)
        .set('Authorization', `Bearer ${validToken(ownerId)}`)
        .send({ reason: 'Severe TOS violation' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.banned).toBe(true);

      const logs = await getAuditLogs({ roomId });
      const banLog = logs.find((l) => l.action === 'BAN_USER');
      expect(banLog).toBeDefined();
      expect(banLog.actorId).toBe(ownerId);
      expect(banLog.targetId).toBe(targetMemberId);
    });

    it('should allow room moderator to delete an inappropriate message with audit trail', async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${validToken(moderatorId)}`)
        .send({ reason: 'Inappropriate content' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe(true);

      const logs = await getAuditLogs({ roomId });
      const deleteLog = logs.find((l) => l.action === 'DELETE_MESSAGE');
      expect(deleteLog).toBeDefined();
      expect(deleteLog.actorId).toBe(moderatorId);
      expect(deleteLog.targetId).toBe(messageId);
      expect(deleteLog.targetType).toBe('message');
    });

    it('should allow room owner to remove a member (CHAT-F-023)', async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomId}/members/${targetMemberId}`)
        .set('Authorization', `Bearer ${validToken(ownerId)}`)
        .send({ reason: 'Evicted by room owner' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.removed).toBe(true);

      const logs = await getAuditLogs({ roomId });
      const removeLog = logs.find((l) => l.action === 'REMOVE_MEMBER');
      expect(removeLog).toBeDefined();
      expect(removeLog.actorId).toBe(ownerId);
      expect(removeLog.targetType).toBe('member');
    });

    it('should allow platform admin to bypass room role and execute actions', async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/members/${targetMemberId}/ban`)
        .set('Authorization', `Bearer ${validToken('global_admin_id', 'admin')}`)
        .send({ reason: 'Platform wide ban' });

      expect(res.status).toBe(200);
      expect(res.body.banned).toBe(true);
    });
  });

  describe('TC-Sec-05.3: Structured Audit Log Integrity & Security (STRIDE Repudiation)', () => {
    it('recordAuditLog() should populate all mandatory audit fields', async () => {
      const log = await recordAuditLog({
        actorId: 'moderator_99',
        action: 'MUTE_USER',
        targetType: 'user',
        targetId: 'user_target_42',
        roomId: 'room_sec_test',
        metadata: { durationMinutes: 60, reason: 'Toxic language' },
      });

      expect(log).toBeInstanceOf(AuditLogModel);
      expect(log.id).toBeDefined();
      expect(log.actorId).toBe('moderator_99');
      expect(log.action).toBe('MUTE_USER');
      expect(log.targetType).toBe('user');
      expect(log.targetId).toBe('user_target_42');
      expect(log.roomId).toBe('room_sec_test');
      expect(log.createdAt).toBeInstanceOf(Date);
      expect(log.metadata).toEqual({ durationMinutes: 60, reason: 'Toxic language' });
    });

    it('sanitizeAuditMetadata() should strip passwords, secrets, and auth tokens (SAD §4.4)', () => {
      const dirtyMetadata = {
        reason: 'Investigating suspicious login',
        password: 'PlaintextPassword123!',
        password_hash: '$2b$12$somehashvalue',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        nested: {
          authorization: 'Bearer secret_token',
          apiKey: 'key_12345',
          validNote: 'Safe text note',
        },
      };

      const clean = sanitizeAuditMetadata(dirtyMetadata);

      expect(clean.reason).toBe('Investigating suspicious login');
      expect(clean.password).toBe('[REDACTED]');
      expect(clean.password_hash).toBe('[REDACTED]');
      expect(clean.token).toBe('[REDACTED]');
      expect(clean.nested.authorization).toBe('[REDACTED]');
      expect(clean.nested.apiKey).toBe('[REDACTED]');
      expect(clean.nested.validNote).toBe('Safe text note');
    });

    it('audit logs retrieved by authorized roles should return structured list', async () => {
      await ModerationService.muteUser({
        roomId,
        targetUserId: targetMemberId,
        actorId: ownerId,
        reason: 'Audit inspection test 1',
      });
      await ModerationService.deleteMessage({
        roomId,
        messageId: 'msg_999',
        actorId: moderatorId,
        reason: 'Audit inspection test 2',
      });

      const res = await request(app)
        .get(`/api/rooms/${roomId}/audit-logs`)
        .set('Authorization', `Bearer ${validToken(ownerId)}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('logs');
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs.length).toBeGreaterThanOrEqual(2);

      const actions = res.body.logs.map((l) => l.action);
      expect(actions).toContain('MUTE_USER');
      expect(actions).toContain('DELETE_MESSAGE');
    });
  });
});
