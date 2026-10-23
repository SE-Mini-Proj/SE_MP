-- Migration: 002_moderation_and_audit_logs.up.sql
-- Description: RBAC & structured audit logging for moderation actions (audit_logs, room_bans, room_mutes)
-- Requirements: CHAT-SR-005, CHAT-F-023; SAD §3.9 (STRIDE), STP §5.1, §13.1 (TC-Sec-05)

-- 1. Structured Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(100),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit log indexes for room, actor, action, and chronological audits
CREATE INDEX IF NOT EXISTS idx_audit_logs_room_created
    ON audit_logs (room_id, created_at DESC)
    WHERE room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
    ON audit_logs (actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs (action);

-- 2. Room Bans Table
CREATE TABLE IF NOT EXISTS room_bans (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_bans_user
    ON room_bans (user_id);

-- 3. Room Mutes Table
CREATE TABLE IF NOT EXISTS room_mutes (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    muted_until TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_mutes_user
    ON room_mutes (user_id);
