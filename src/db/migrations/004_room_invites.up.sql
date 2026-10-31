-- Migration: 004_room_invites.up.sql
-- Description: Store hashed invitation tokens for private chat rooms.

CREATE TABLE IF NOT EXISTS room_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_room_invites_room_id
    ON room_invites (room_id);

CREATE INDEX IF NOT EXISTS idx_room_invites_expires_at
    ON room_invites (expires_at);
