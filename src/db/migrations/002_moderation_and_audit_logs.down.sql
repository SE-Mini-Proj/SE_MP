-- Migration: 002_moderation_and_audit_logs.down.sql
-- Description: Rollback audit_logs, room_bans, and room_mutes tables

DROP TABLE IF EXISTS room_mutes CASCADE;
DROP TABLE IF EXISTS room_bans CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
