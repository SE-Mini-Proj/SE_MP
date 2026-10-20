-- Migration: 001_initial_schema.down.sql
-- Description: Rollback core schema v1

DROP INDEX IF EXISTS idx_users_email_lower;
DROP INDEX IF EXISTS idx_users_username_lower;
DROP INDEX IF EXISTS idx_room_members_user;
DROP INDEX IF EXISTS idx_messages_direct_conv;
DROP INDEX IF EXISTS idx_messages_room_created;

DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS room_members CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS users CASCADE;
