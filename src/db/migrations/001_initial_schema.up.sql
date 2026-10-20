-- Migration: 001_initial_schema.up.sql
-- Description: Core schema v1 for Real-Time Chat Application (users, rooms, room_members, messages)
-- Requirements: CHAT-F-001, CHAT-F-002, CHAT-F-011, CHAT-F-020, CHAT-F-022, CHAT-F-040

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Chat Rooms Table
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    is_private BOOLEAN DEFAULT FALSE,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Room Membership Table (Composite Primary Key)
CREATE TABLE IF NOT EXISTS room_members (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);

-- 4. Messages Table (Supports both Direct and Room messaging)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    delivered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_message_target CHECK (
        (room_id IS NOT NULL AND recipient_id IS NULL) OR
        (room_id IS NULL AND recipient_id IS NOT NULL)
    )
);

-- Indexes for performance & query optimization (SAD Section 3.4 & Issue #2)
CREATE INDEX IF NOT EXISTS idx_messages_room_created
    ON messages (room_id, created_at DESC)
    WHERE room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_direct_conv
    ON messages (sender_id, recipient_id, created_at DESC)
    WHERE room_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_room_members_user
    ON room_members (user_id);

CREATE INDEX IF NOT EXISTS idx_users_username_lower
    ON users (LOWER(username));

CREATE INDEX IF NOT EXISTS idx_users_email_lower
    ON users (LOWER(email));
