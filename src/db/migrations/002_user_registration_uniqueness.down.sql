-- Rollback: 002_user_registration_uniqueness.down.sql
-- Description: Remove case-insensitive user uniqueness indexes.

DROP INDEX IF EXISTS uq_users_email_lower;
DROP INDEX IF EXISTS uq_users_username_lower;
